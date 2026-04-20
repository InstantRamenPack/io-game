import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import {
  CRAFTING_STATION_INTERACT_PADDING,
  CRAFTING_STATION_QUERY_RADIUS,
} from "@shared/gameplay/crafting.ts";
import { BUILD_PLACEMENT_MAX_DISTANCE } from "@shared/gameplay/building.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ActionMessage, MoveIntentKey } from "@shared/net/protocol.ts";
import type { PlayerSnapshot } from "@shared/net/snapshots.ts";
import { Entity } from "@server/entities/Entity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import {
  entityTypeRegistry,
  itemTypeRegistry,
} from "@server/registry/registries.ts";
import type { World } from "@server/world/World.ts";
import { isBuildingCtor, isWeaponCtor } from "@server/runtime/ctorGuards.ts";

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
  public readonly queuedActions: ActionMessage[] = [];
  private queuedActionHead = 0;

  private readonly heldMovement: HeldMovementState = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  constructor(id: number, name = "player") {
    super(id, { maxHp: 100 });
    this.name = name;
    this.inventory = new Inventory();
    this.setHitboxProfiles({ default: [makeHitboxRect(32, 32)] });
    this.collisionMode = "dynamic";
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
    this.x = world.gameConfig.worldSize.w / 2;
    this.y = world.gameConfig.worldSize.h / 2;
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
    const canStoreCraftOutput = isWeaponCtor(outputCtor)
      ? this.inventory.canAddWeaponCount(recipe.outputAmount)
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

    const building = new buildingEntry.ctor(
      world.allocEntityId(),
      buildingEntry.content.label,
    );
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
          this.getActiveWeapon()?.hit(
            world,
            this,
            actionMessage.aim.x,
            actionMessage.aim.y,
          );
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
