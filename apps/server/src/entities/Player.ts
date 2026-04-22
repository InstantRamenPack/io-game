import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { isRecipeBlueprintLocked } from "@shared/content/catalog.ts";
import {
  CRAFTING_STATION_INTERACT_PADDING,
  CRAFTING_STATION_QUERY_RADIUS,
  BUILD_PLACEMENT_MAX_DISTANCE,
  CHEST_INTERACT_PADDING,
  CHEST_SLOT_COUNT,
  HOTBAR_SLOT_COUNT,
} from "@shared/gameplay/constants.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import type { ActionMessage, MoveIntentKey } from "@shared/net/protocol.ts";
import type { PlayerSnapshot } from "@shared/net/snapshots.ts";
import { Entity } from "@server/entities/Entity.ts";
import {
  requireHitboxEntityBaselineContent,
  requireMovingEntityBaselineContent,
} from "@server/entities/entityBaselineContent.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import {
  entityTypeRegistry,
  itemTypeRegistry,
} from "@server/registry/registries.ts";
import type { World } from "@server/world/World.ts";
import { isBuildingCtor, isWeaponCtor } from "@server/runtime/ctorGuards.ts";
import { Chest, type ChestSlot } from "@server/entities/buildings/Chest.ts";
import type { CollisionMode } from "@shared/content/schema.ts";

type HeldMovementState = Record<MoveIntentKey, boolean>;

/**
 * Authoritative player entity driven by held movement state and queued actions.
 */
export class Player extends Entity {
  public static readonly kind = "player" as const;
  public static override readonly resourceName = "base";

  public name: string;
  public inventory: Inventory;
  public moveSpeed = 15;
  private readonly defaultCollisionMode: CollisionMode;
  public readonly queuedActions: ActionMessage[] = [];
  private queuedActionHead = 0;
  private aimTheta = 0;

  private readonly heldMovement: HeldMovementState = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

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
    this.setMovementTuning({
      driveAccelerationPerTick: Math.max(4, this.moveSpeed * 0.45),
    });
  }

  public setMoveIntent(key: MoveIntentKey, pressed: boolean): void {
    this.heldMovement[key] = pressed;
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

  public clearQueuedInputState(): void {
    this.queuedActions.length = 0;
    this.queuedActionHead = 0;
    this.heldMovement.up = false;
    this.heldMovement.down = false;
    this.heldMovement.left = false;
    this.heldMovement.right = false;
  }

  public getQueuedActionCount(): number {
    return this.queuedActions.length - this.queuedActionHead;
  }

  public override tick(world: World): void {
    super.tick(world);
    if (!this.alive || !world.entities.has(this.id)) {
      return;
    }

    for (const weapon of this.inventory.iterateWeaponSlots()) {
      weapon.ownerId = this.id;
      weapon.tick(world);
    }

    this.applyHeldMovement(world);
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
    };
  }

  public getActiveWeapon(): Weapon | undefined {
    return this.inventory.getActiveWeapon();
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
    this.collisionMode = "none";
    this.resetMovement();
    world.focusedTrace.recordEntityEvent(world, "player_died", this, {
      x: this.x,
      y: this.y,
    });
  }

  public respawn(world: World): void {
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
    this.x = world.gameConfig.worldSize.w / 2;
    this.y = world.gameConfig.worldSize.h / 2;
    this.rotation = 0;
    this.collisionMode = this.defaultCollisionMode;
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

  public craft(world: World, itemTypeId: ResourceId): void {
    const shouldTrace = world.focusedTrace.matchesEntity(this);
    const nearbyCraftingStations = this.getNearbyCraftingStations(world);
    const nearCraftingStation = nearbyCraftingStations.some((station) => {
      const bounds = station.getWorldBounds();
      return (
        this.x >= bounds.minX - CRAFTING_STATION_INTERACT_PADDING &&
        this.x <= bounds.maxX + CRAFTING_STATION_INTERACT_PADDING &&
        this.y >= bounds.minY - CRAFTING_STATION_INTERACT_PADDING &&
        this.y <= bounds.maxY + CRAFTING_STATION_INTERACT_PADDING
      );
    });
    if (!nearCraftingStation) {
      if (shouldTrace) {
        world.focusedTrace.recordEntityEvent(world, "craft_attempt", this, {
          itemTypeId,
          result: "not_near_station",
        });
      }
      return;
    }

    const outputEntry = itemTypeRegistry.get(itemTypeId);
    const recipe = outputEntry?.content.recipe;
    if (!outputEntry || !recipe) {
      if (shouldTrace) {
        world.focusedTrace.recordEntityEvent(world, "craft_attempt", this, {
          itemTypeId,
          result: "missing_recipe",
        });
      }
      return;
    }

    if (
      isRecipeBlueprintLocked(itemTypeId) &&
      !this.inventory.isRecipeUnlocked(itemTypeId)
    ) {
      if (shouldTrace) {
        world.focusedTrace.recordEntityEvent(world, "craft_attempt", this, {
          itemTypeId,
          result: "recipe_locked",
        });
      }
      return;
    }

    if (!this.inventory.hasTypes(recipe.costs)) {
      if (shouldTrace) {
        world.focusedTrace.recordEntityEvent(world, "craft_attempt", this, {
          itemTypeId,
          result: "missing_resources",
          costs: recipe.costs,
        });
      }
      return;
    }

    const outputCtor = outputEntry.ctor;
    const weaponSlotsFreedByCosts = isWeaponCtor(outputCtor)
      ? recipe.costs.reduce((total, cost) => {
          const costEntry = itemTypeRegistry.get(cost.typeId);
          return costEntry && isWeaponCtor(costEntry.ctor)
            ? total + cost.amount
            : total;
        }, 0)
      : 0;
    const netWeaponSlotsNeeded = recipe.outputAmount - weaponSlotsFreedByCosts;
    const canStoreCraftOutput = isWeaponCtor(outputCtor)
      ? netWeaponSlotsNeeded <= 0 ||
        this.inventory.canAddWeaponCount(netWeaponSlotsNeeded)
      : this.inventory.canAddStackable(itemTypeId, recipe.outputAmount);
    if (!canStoreCraftOutput) {
      if (shouldTrace) {
        world.focusedTrace.recordEntityEvent(world, "craft_attempt", this, {
          itemTypeId,
          result: "inventory_full",
          outputAmount: recipe.outputAmount,
        });
      }
      return;
    }

    this.inventory.consumeTypes(recipe.costs);
    if (isWeaponCtor(outputCtor)) {
      for (let count = 0; count < recipe.outputAmount; count += 1) {
        this.inventory.addWeapon(new outputCtor());
      }
      if (shouldTrace) {
        world.focusedTrace.recordEntityEvent(world, "craft_attempt", this, {
          itemTypeId,
          result: "crafted_weapon",
          outputAmount: recipe.outputAmount,
          totalOwnedAfterCraft: this.inventory.countType(itemTypeId),
        });
      }
      return;
    }

    this.inventory.addStackable(itemTypeId, recipe.outputAmount);
    if (shouldTrace) {
      world.focusedTrace.recordEntityEvent(world, "craft_attempt", this, {
        itemTypeId,
        result: "crafted_stackable",
        outputAmount: recipe.outputAmount,
        totalOwnedAfterCraft: this.inventory.countType(itemTypeId),
      });
    }
  }

  public placeStructure(world: World, targetX: number, targetY: number): void {
    const selectedBuildable = this.inventory.getSelectedBuildable();
    const itemTypeId = selectedBuildable?.typeId;
    if (!itemTypeId) {
      return;
    }

    const itemEntry = itemTypeRegistry.get(itemTypeId);
    const buildingTypeId = itemEntry?.content.buildsEntityTypeId;
    if (!buildingTypeId) {
      return;
    }

    if (
      Math.hypot(targetX - this.x, targetY - this.y) >
      BUILD_PLACEMENT_MAX_DISTANCE
    ) {
      return;
    }

    const buildingEntry = entityTypeRegistry.get(buildingTypeId);
    if (!buildingEntry) {
      return;
    }

    if (!isBuildingCtor(buildingEntry.ctor)) {
      return;
    }

    const building = new buildingEntry.ctor(world.allocEntityId());
    building.x = targetX;
    building.y = targetY;
    building.ownerId = this.id;
    const buildingBounds = building.getWorldBounds();

    if (
      buildingBounds.minX < 0 ||
      buildingBounds.minY < 0 ||
      buildingBounds.maxX > world.gameConfig.worldSize.w ||
      buildingBounds.maxY > world.gameConfig.worldSize.h
    ) {
      return;
    }

    for (const entity of world.spatial.queryBox(
      buildingBounds.minX,
      buildingBounds.minY,
      buildingBounds.maxX,
      buildingBounds.maxY,
    )) {
      if (entity.id === this.id || entity.collisionMode === "none") {
        continue;
      }
      if (this.doHitboxesOverlap(building, entity)) {
        return;
      }
    }

    if (!this.inventory.consumeSelectedBuildable(1)) {
      return;
    }

    world.spawn(building);
  }

  private applyHeldMovement(world: World): void {
    const shouldTrace = world.focusedTrace.matchesEntity(this);
    if (this.isStunned()) {
      const clearedQueuedActions =
        this.queuedActions.length - this.queuedActionHead;
      this.queuedActions.length = 0;
      this.queuedActionHead = 0;
      this.steerTowardVelocity(0, 0, Number.POSITIVE_INFINITY);
      if (shouldTrace) {
        world.focusedTrace.recordEntityEvent(
          world,
          "movement_blocked_stunned",
          this,
          {
            clearedQueuedActions,
          },
        );
      }
      return;
    }

    let moveX =
      Number(this.heldMovement.right) - Number(this.heldMovement.left);
    let moveY = Number(this.heldMovement.down) - Number(this.heldMovement.up);
    const vectorLength = Math.hypot(moveX, moveY);
    if (vectorLength > 1) {
      moveX /= vectorLength;
      moveY /= vectorLength;
    }

    const speedMultiplier = this.activeEffects.reduce(
      (accumulator, effect) =>
        effect.speedMultiplier !== undefined
          ? accumulator * effect.speedMultiplier
          : accumulator,
      1,
    );

    this.setDesiredVelocity(
      moveX * this.moveSpeed * speedMultiplier,
      moveY * this.moveSpeed * speedMultiplier,
    );
    if (shouldTrace) {
      const velocityComponents = this.getDebugVelocityComponents();
      world.focusedTrace.recordEntityEvent(world, "movement_resolved", this, {
        heldMovement: { ...this.heldMovement },
        moveX,
        moveY,
        speedMultiplier,
        desiredVx: velocityComponents.desiredVx,
        desiredVy: velocityComponents.desiredVy,
        driveVx: velocityComponents.driveVx,
        driveVy: velocityComponents.driveVy,
        momentumVx: velocityComponents.momentumVx,
        momentumVy: velocityComponents.momentumVy,
      });
    }
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
          this.craft(world, actionMessage.craft.itemTypeId);
          break;
        case "build":
          this.placeStructure(
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
        case "chestMove":
          this.applyChestMove(world, actionMessage.chestMove);
          break;
      }
    }

    if (this.queuedActionHead > 0) {
      this.queuedActions.length = 0;
      this.queuedActionHead = 0;
    }
  }

  private doHitboxesOverlap(leftEntity: Entity, rightEntity: Entity): boolean {
    return doResolvedRectSetsOverlap(
      leftEntity.getWorldHitboxes(),
      rightEntity.getWorldHitboxes(),
    );
  }

  private applyChestMove(
    world: World,
    action: {
      chestEntityId: number;
      fromSource: "hotbar" | "chest";
      fromIndex: number;
      toSource: "hotbar" | "chest";
      toIndex: number;
    },
  ): void {
    const { chestEntityId, fromSource, fromIndex, toSource, toIndex } = action;

    const maxHotbar = HOTBAR_SLOT_COUNT - 1;
    if (fromSource === "hotbar" && (fromIndex < 0 || fromIndex > maxHotbar)) {
      return;
    }
    if (
      fromSource === "chest" &&
      (fromIndex < 0 || fromIndex >= CHEST_SLOT_COUNT)
    ) {
      return;
    }
    if (toSource === "hotbar" && (toIndex < 0 || toIndex > maxHotbar)) {
      return;
    }
    if (
      toSource === "chest" &&
      (toIndex < 0 || toIndex >= CHEST_SLOT_COUNT)
    ) {
      return;
    }

    const chestEntity = world.entities.get<Chest>(chestEntityId);
    if (!chestEntity || chestEntity.typeId !== "building:chest") {
      return;
    }

    const bounds = chestEntity.getWorldBounds();
    if (
      this.x < bounds.minX - CHEST_INTERACT_PADDING ||
      this.x > bounds.maxX + CHEST_INTERACT_PADDING ||
      this.y < bounds.minY - CHEST_INTERACT_PADDING ||
      this.y > bounds.maxY + CHEST_INTERACT_PADDING
    ) {
      return;
    }

    const fromValue = this.extractSlotValue(fromSource, fromIndex, chestEntity);
    if (fromValue === null) {
      return;
    }
    const toValue = this.extractSlotValue(toSource, toIndex, chestEntity);

    if (
      fromValue.kind === "buildable" &&
      toValue?.kind === "buildable" &&
      fromValue.typeId === toValue.typeId
    ) {
      const stacked = fromValue.count + toValue.count;
      this.writeSlotValue(
        toSource,
        toIndex,
        chestEntity,
        { kind: "buildable", typeId: toValue.typeId, count: stacked },
      );
      this.writeSlotValue(fromSource, fromIndex, chestEntity, null);
      return;
    }

    this.writeSlotValue(toSource, toIndex, chestEntity, fromValue);
    this.writeSlotValue(fromSource, fromIndex, chestEntity, toValue);
  }

  private extractSlotValue(
    source: "hotbar" | "chest",
    index: number,
    chest: Chest,
  ): ChestSlot {
    if (source === "chest") {
      return chest.getSlot(index);
    }
    const slot = this.inventory.hotbarSlots[index] ?? null;
    if (!slot) {
      return null;
    }
    if (slot.kind === "buildable") {
      return { kind: "buildable", typeId: slot.typeId, count: slot.count };
    }
    return { kind: "weapon", typeId: slot.weapon.typeId };
  }

  private writeSlotValue(
    source: "hotbar" | "chest",
    index: number,
    chest: Chest,
    value: ChestSlot,
  ): void {
    if (source === "chest") {
      chest.setSlot(index, value);
      return;
    }
    if (value === null) {
      this.inventory.hotbarSlots[index] = null;
      return;
    }
    if (value.kind === "buildable") {
      this.inventory.hotbarSlots[index] = {
        kind: "buildable",
        typeId: value.typeId,
        count: value.count,
      };
      return;
    }
    const entry = itemTypeRegistry.get(value.typeId);
    if (entry && isWeaponCtor(entry.ctor)) {
      this.inventory.hotbarSlots[index] = {
        kind: "weapon",
        weapon: new entry.ctor(),
      };
    }
  }

  private getNearbyCraftingStations(world: World): Entity[] {
    return world.spatial
      .queryBox(
        this.x - CRAFTING_STATION_QUERY_RADIUS,
        this.y - CRAFTING_STATION_QUERY_RADIUS,
        this.x + CRAFTING_STATION_QUERY_RADIUS,
        this.y + CRAFTING_STATION_QUERY_RADIUS,
      )
      .filter((entity) => entity.typeId === "building:crafting_station");
  }
}
