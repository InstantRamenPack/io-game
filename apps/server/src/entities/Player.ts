import { requireEntityContent } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import type {
  ActionMessage,
  CraftTargetInput,
  InputMovement,
} from "@shared/net/protocol.ts";
import type { PlayerSnapshot } from "@shared/net/snapshots.ts";
import { getArmorStats } from "@shared/gameplay/rules/armorRules.ts";
import { Entity } from "@server/entities/Entity.ts";
import { isDebugAdminPlayerName } from "@server/content/serverContentCapabilities.ts";
import {
  requireHitboxEntityBaselineContent,
  requireMovingEntityBaselineContent,
} from "@server/entities/entityBaselineContent.ts";
import { craft } from "@server/entities/player/PlayerCrafting.ts";
import { placeStructure } from "@server/entities/player/PlayerBuildPlacement.ts";
import {
  applyArmorMove,
  applyChestMove,
  dropSelectedItem,
  pickupNearestOverlappingItem,
  recycleSelectedItem,
  useConsumable,
} from "@server/entities/player/PlayerInventoryActions.ts";
import { repairTower } from "@server/entities/player/PlayerTowerInteraction.ts";
import { getPlayerSpawnPosition } from "@server/entities/playerSpawn.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import { Fists } from "@server/items/weapons/Fists.ts";
import type { World } from "@server/world/World.ts";
import type { CollisionMode } from "@shared/content/schema.ts";

const DEBUG_SPECTATOR_MOVE_SPEED_MULTIPLIER = 4;

type PlayerInputIntentState = {
  seq: number;
  clientTimeMs?: number;
  theta: number;
  movement: InputMovement;
  receivedAtMs: number;
};

/**
 * Authoritative player entity driven by held movement state and queued actions.
 */
export class Player extends Entity {
  public static readonly kind = "player" as const;
  public static override readonly resourceName = "base";
  private static readonly PASSIVE_HEALING = (() => {
    const passiveHealing = requireEntityContent(Player.typeId).player
      ?.passiveHealing;
    if (!passiveHealing) {
      throw new Error(
        "Missing player passiveHealing content for entity:player/base",
      );
    }
    return passiveHealing;
  })();

  private static readonly INPUT_STALE_TIMEOUT_MS = 250;

  public name: string;
  public inventory: Inventory;
  public moveSpeed = 15;
  private readonly defaultCollisionMode: CollisionMode;
  private readonly fists = new Fists();
  public readonly queuedActions: ActionMessage[] = [];
  private queuedActionHead = 0;
  private aimTheta = 0;
  private latestInputIntent?: PlayerInputIntentState;
  private regenAccumulator = 0;
  private equippedArmorTypeId?: ResourceId;

  constructor(id: number, name = "player") {
    const baseline = requireMovingEntityBaselineContent(Player.typeId);
    const hitboxContent = requireHitboxEntityBaselineContent(Player.typeId);
    super(id, { maxHp: baseline.maxHp });
    this.name = name;
    this.inventory = new Inventory();
    this.moveSpeed = baseline.moveSpeed;
    this.setHitboxProfiles(
      hitboxContent.hitboxProfiles,
      hitboxContent.activeHitboxProfile ?? "default",
    );
    this.collisionMode = baseline.collisionMode;
    this.defaultCollisionMode = baseline.collisionMode;
    if (this.isDebugSpectatorMode()) {
      this.moveSpeed *= DEBUG_SPECTATOR_MOVE_SPEED_MULTIPLIER;
      this.collisionMode = "none";
    }
    this.setMovementTuning({
      driveAccelerationPerTick: Math.max(4, this.moveSpeed * 0.45),
    });
  }

  public enqueueAction(actionMessage: ActionMessage): void {
    this.queuedActions.push(actionMessage);
    if (this.queuedActions.length - this.queuedActionHead <= 64) {
      return;
    }

    this.queuedActionHead += 1;
    if (this.queuedActionHead >= 32) {
      this.queuedActions.splice(0, this.queuedActionHead);
      this.queuedActionHead = 0;
    }
  }

  public setAimTheta(theta: number): void {
    this.aimTheta = normalizeAngle(theta);
  }

  public applyInputIntent(input: PlayerInputIntentState): void {
    this.latestInputIntent = {
      ...input,
      theta: normalizeAngle(input.theta),
      movement: { ...input.movement },
    };
  }

  public clearQueuedInputState(): void {
    this.queuedActions.length = 0;
    this.queuedActionHead = 0;
  }

  public getQueuedActionCount(): number {
    return this.queuedActions.length - this.queuedActionHead;
  }

  public override tick(world: World): void {
    super.tick(world);
    if (!this.alive || !world.entities.has(this.id)) {
      return;
    }

    if (
      this.hp < this.maxHp &&
      world.tick - this.lastDamageTick >=
        Player.PASSIVE_HEALING.outOfCombatTicks
    ) {
      this.regenAccumulator += Player.PASSIVE_HEALING.hpPerTick;
      if (this.regenAccumulator >= 1) {
        const heal = Math.floor(this.regenAccumulator);
        this.hp = Math.min(this.maxHp, this.hp + heal);
        this.regenAccumulator -= heal;
      }
    } else {
      this.regenAccumulator = 0;
    }

    for (const weapon of this.inventory.iterateWeaponSlots()) {
      weapon.ownerId = this.id;
      weapon.tick(world);
    }
    this.fists.ownerId = this.id;
    this.fists.tick(world);

    const hasFreshInput = this.applyLatestInputIntent(world);
    if (!hasFreshInput) {
      this.resetDriveVelocity();
    }
    this.rotation = this.aimTheta;
    this.applyQueuedActions(world);
  }

  public override toSnapshot(): PlayerSnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "player",
      name: this.name,
      inventory: this.inventory.toSnapshot(this),
      activeEffects: this.getActiveEffectSnapshots(),
      moveSpeed: this.moveSpeed,
      equippedItem: this.getActiveWeapon()?.toEquippedItemSnapshot(this),
      armorTypeId: this.equippedArmorTypeId,
      armorTier: this.getEquippedArmorStats()?.tier,
      armorDamageReductionPct: this.getEquippedArmorStats()?.damageReductionPct,
    };
  }

  public override getDamageReductionMultiplier(): number {
    if (this.isDebugSpectatorMode()) {
      return 0;
    }
    const armorStats = this.getEquippedArmorStats();
    return armorStats?.damageMultiplier ?? 1;
  }

  public override getDamageReflectionPct(): number {
    const armorStats = this.getEquippedArmorStats();
    return armorStats?.reflectDamagePct ?? 0;
  }

  public canEquipSelectedArmorFromAttack(): boolean {
    return false;
  }

  public getEquippedArmorTypeId(): ResourceId | undefined {
    return this.equippedArmorTypeId;
  }

  public setEquippedArmorTypeId(typeId: ResourceId | undefined): void {
    this.equippedArmorTypeId = typeId;
  }

  public getActiveWeapon(): Weapon | undefined {
    const selectedSlot =
      this.inventory.hotbarSlots[this.inventory.selectedHotbarIndex];
    if (selectedSlot?.kind === "weapon") {
      return selectedSlot.weapon;
    }
    if (selectedSlot === null) {
      return this.fists;
    }
    return undefined;
  }

  public override getReloadInventory(): Inventory {
    return this.inventory;
  }

  public override handleDeath(world: World): void {
    this.alive = false;
    this.hp = 0;
    this.activeEffects = [];
    this.clearQueuedInputState();
    this.aimTheta = 0;
    this.rotation = 0;
    this.latestInputIntent = undefined;
    this.collisionMode = "none";
    this.resetMovement();
    world.focusedTrace.recordEntityEvent(world, "player_died", this, {
      x: this.x,
      y: this.y,
    });
  }

  public respawn(world: World, position?: { x: number; y: number }): void {
    const before = {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      hp: this.hp,
      alive: this.alive,
    };
    this.alive = true;
    this.hp = this.maxHp;
    this.activeEffects = [];
    this.clearQueuedInputState();
    this.aimTheta = 0;
    this.latestInputIntent = undefined;
    const spawnPosition =
      position ?? getPlayerSpawnPosition(world.gameConfig.worldSize);
    this.x = spawnPosition.x;
    this.y = spawnPosition.y;
    this.rotation = 0;
    this.collisionMode = this.isDebugSpectatorMode()
      ? "none"
      : this.defaultCollisionMode;
    this.resetMovement();
    world.focusedTrace.recordEntityEvent(world, "player_respawn", this, {
      before,
      after: {
        x: this.x,
        y: this.y,
        vx: this.vx,
        vy: this.vy,
        hp: this.hp,
        alive: this.alive,
      },
    });
  }

  public craft(
    world: World,
    itemTypeId: ResourceId,
    target?: CraftTargetInput,
  ): void {
    craft(this, world, itemTypeId, target);
  }

  public placeStructure(world: World, targetX: number, targetY: number): void {
    placeStructure(this, world, targetX, targetY);
  }

  private applyLatestInputIntent(world: World): boolean {
    const input = this.latestInputIntent;
    if (!input) {
      return false;
    }
    if (
      world.simulationTimeMs - input.receivedAtMs >
      Player.INPUT_STALE_TIMEOUT_MS
    ) {
      if (world.focusedTrace.matchesEntity(this)) {
        world.focusedTrace.recordEntityEvent(
          world,
          "input_intent_stale",
          this,
          {
            seq: input.seq,
            clientTimeMs: input.clientTimeMs ?? null,
            receivedAtMs: input.receivedAtMs,
            simulationTimeMs: world.simulationTimeMs,
          },
        );
      }
      return false;
    }

    this.aimTheta = input.theta;
    this.rotation = input.theta;
    const desiredVelocity = this.computeDesiredVelocity(input.movement);
    this.setDesiredVelocity(desiredVelocity.x, desiredVelocity.y);

    if (world.focusedTrace.matchesEntity(this)) {
      world.focusedTrace.recordEntityEvent(
        world,
        "input_intent_tick_applied",
        this,
        {
          seq: input.seq,
          clientTimeMs: input.clientTimeMs ?? null,
          movement: { ...input.movement },
          desiredVx: desiredVelocity.x,
          desiredVy: desiredVelocity.y,
          theta: input.theta,
        },
      );
    }
    return true;
  }

  private computeDesiredVelocity(movement: InputMovement): {
    x: number;
    y: number;
  } {
    if (this.isStunned()) {
      return { x: 0, y: 0 };
    }

    let moveX = 0;
    let moveY = 0;
    if (movement.left) {
      moveX -= 1;
    }
    if (movement.right) {
      moveX += 1;
    }
    if (movement.up) {
      moveY -= 1;
    }
    if (movement.down) {
      moveY += 1;
    }

    const magnitude = Math.hypot(moveX, moveY);
    if (magnitude <= Number.EPSILON) {
      return { x: 0, y: 0 };
    }

    const speed = this.moveSpeed * this.getMovementSpeedMultiplier();
    return {
      x: (moveX / magnitude) * speed,
      y: (moveY / magnitude) * speed,
    };
  }

  private getMovementSpeedMultiplier(): number {
    let multiplier = 1;
    for (const effect of this.activeEffects) {
      if (effect.speedMultiplier !== undefined) {
        multiplier *= effect.speedMultiplier;
      }
    }
    return multiplier;
  }

  public isDebugSpectatorMode(): boolean {
    return isDebugAdminPlayerName(this.name);
  }

  private applyQueuedActions(world: World): void {
    while (this.queuedActionHead < this.queuedActions.length) {
      const actionMessage = this.queuedActions[this.queuedActionHead];
      this.queuedActionHead += 1;
      if (!actionMessage) {
        continue;
      }

      switch (actionMessage.action) {
        case "selectHotbar":
          this.inventory.setSelectedHotbarIndex(actionMessage.index);
          break;
        case "attack":
          this.setAimTheta(actionMessage.theta);
          this.getActiveWeapon()?.hit(world, this, actionMessage.theta);
          break;
        case "craft":
          craft(
            this,
            world,
            actionMessage.craft.itemTypeId,
            actionMessage.craft.target,
          );
          break;
        case "build":
          placeStructure(
            this,
            world,
            actionMessage.build.x,
            actionMessage.build.y,
          );
          break;
        case "inventoryMove":
          this.inventory.moveHotbarSlot(
            actionMessage.inventoryMove.fromSlotIndex,
            actionMessage.inventoryMove.toSlotIndex,
          );
          break;
        case "armorMove":
          applyArmorMove(this, actionMessage.armorMove);
          break;
        case "chestMove":
          applyChestMove(this, world, actionMessage.chestMove);
          break;
        case "drop":
          dropSelectedItem(this, world, actionMessage.dropWholeStack);
          break;
        case "pickup":
          pickupNearestOverlappingItem(this, world);
          break;
        case "recycle":
          recycleSelectedItem(this, world);
          break;
        case "reload": {
          const activeWeapon = this.getActiveWeapon();
          if (activeWeapon instanceof RangedWeapon) {
            activeWeapon.requestReload(this);
          }
          break;
        }
        case "useConsumable":
          useConsumable(this, world, actionMessage.typeId);
          break;
        case "repair_tower":
          repairTower(this, world, actionMessage.towerId);
          break;
      }
    }

    if (this.queuedActionHead > 0) {
      this.queuedActions.length = 0;
      this.queuedActionHead = 0;
    }
  }

  private getEquippedArmorStats() {
    return this.equippedArmorTypeId
      ? getArmorStats(this.equippedArmorTypeId)
      : null;
  }
}
