import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { isRecipeBlueprintLocked } from "@shared/content/catalog.ts";
import {
  CRAFTING_STATION_INTERACT_PADDING,
  CRAFTING_STATION_QUERY_RADIUS,
  BUILD_PLACEMENT_MAX_DISTANCE,
  CHEST_INTERACT_PADDING,
  CHEST_SLOT_COUNT,
  HOTBAR_SLOT_COUNT,
  RECYCLER_INTERACT_PADDING,
  TOWER_INTERACT_PADDING,
} from "@shared/gameplay/constants.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import type { ActionMessage, InputMovement } from "@shared/net/protocol.ts";
import type { PlayerSnapshot } from "@shared/net/snapshots.ts";
import { Entity } from "@server/entities/Entity.ts";
import {
  requireHitboxEntityBaselineContent,
  requireMovingEntityBaselineContent,
} from "@server/entities/entityBaselineContent.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { getPlayerSpawnPosition } from "@server/entities/playerSpawn.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { absorbInventoryByAcquisitionRules } from "@server/items/acquisition/granting.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import { Fists } from "@server/items/weapons/Fists.ts";
import {
  entityTypeRegistry,
  itemTypeRegistry,
} from "@server/registry/registries.ts";
import type { World } from "@server/world/World.ts";
import {
  isBuildingCtor,
  isStructureCtor,
  isWeaponCtor,
} from "@server/runtime/ctorGuards.ts";
import type { Chest, ChestSlot } from "@server/entities/buildings/Chest.ts";
import { Recycler } from "@server/entities/buildings/Recycler.ts";
import { EnergyTower } from "@server/entities/buildings/EnergyTower.ts";
import { CommsTower } from "@server/entities/buildings/CommsTower.ts";
import type { CollisionMode } from "@shared/content/schema.ts";

const TOWER_REPAIR_HP_DIVISOR = 50;

type PlayerInputIntentState = {
  seq: number;
  clientTimeMs?: number;
  theta: number;
  movement: InputMovement;
  receivedAtMs: number;
};

const RECYCLE_HUNK_BY_ITEM: Record<string, number> = {
  "item:fists": 0,
  "item:baseball_bat": 3,
  "item:basic_dagger": 3,
  "item:lead_pipe": 4,
  "item:basic_spear": 5,
  "item:basic_sword": 6,
  "item:scissors": 6,
  "item:zombie_sword": 7,
  "item:saboteur_sword": 7,
  "item:cleaver": 7,
  "item:taser": 8,
  "item:spiked_spear": 9,
  "item:katana": 12,
  "item:basic_gun": 10,
  "item:basic_rifle": 12,
  "item:crossbow": 14,
  "item:drone_shooter": 14,
  "item:sniper": 18,
  "item:wall": 2,
  "item:landmine": 4,
  "item:chest": 6,
  "item:crafting_station": 10,
  "item:cannon": 12,
};

/**
 * Authoritative player entity driven by held movement state and queued actions.
 */
export class Player extends Entity {
  public static readonly kind = "player" as const;
  public static override readonly resourceName = "base";

  public static readonly MAX_FOOD = 100;
  private static readonly INPUT_STALE_TIMEOUT_MS = 250;
  // Drains to zero in 3 minutes at 20 ticks/sec
  private static readonly FOOD_DRAIN_PER_TICK = 100 / (3 * 60 * 20);
  // 1 HP per 2 seconds at 20 ticks/sec, fueled by food.
  private static readonly PASSIVE_HEAL_INTERVAL_TICKS = 40;
  private static readonly PASSIVE_HEAL_FOOD_COST = 1;

  public name: string;
  public inventory: Inventory;
  public moveSpeed = 15;
  public food = Player.MAX_FOOD;
  public maxFood = Player.MAX_FOOD;
  private readonly defaultCollisionMode: CollisionMode;
  private readonly fists = new Fists();
  public readonly queuedActions: ActionMessage[] = [];
  private queuedActionHead = 0;
  private aimTheta = 0;
  private latestInputIntent?: PlayerInputIntentState;

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

    for (const weapon of this.inventory.iterateWeaponSlots()) {
      weapon.ownerId = this.id;
      weapon.tick(world);
    }
    this.fists.ownerId = this.id;
    this.fists.tick(world);

    this.food = Math.max(0, this.food - Player.FOOD_DRAIN_PER_TICK);
    if (
      world.tick % Player.PASSIVE_HEAL_INTERVAL_TICKS === 0 &&
      this.food > 0
    ) {
      this.hp = Math.min(this.maxHp, this.hp + 1);
      this.food = Math.max(0, this.food - Player.PASSIVE_HEAL_FOOD_COST);
    }
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
      food: this.food,
      maxFood: this.maxFood,
    };
  }

  public override getDamageReductionMultiplier(): number {
    const fraction = this.food / Math.max(1, this.maxFood);
    if (fraction >= 0.8) return 0.7;
    if (fraction >= 0.5) return 0.85;
    return 1;
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
    this.food = this.maxFood;
    this.activeEffects = [];
    this.clearQueuedInputState();
    this.aimTheta = 0;
    this.latestInputIntent = undefined;
    const spawnPosition =
      position ?? getPlayerSpawnPosition(world.gameConfig.worldSize);
    this.x = spawnPosition.x;
    this.y = spawnPosition.y;
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
    const targetEntityTypeId = itemEntry?.content.buildsEntityTypeId;
    if (!targetEntityTypeId) {
      return;
    }

    if (
      Math.hypot(targetX - this.x, targetY - this.y) >
      BUILD_PLACEMENT_MAX_DISTANCE
    ) {
      return;
    }

    const targetEntityEntry = entityTypeRegistry.get(targetEntityTypeId);
    if (!targetEntityEntry) {
      return;
    }

    const targetEntityCtor = targetEntityEntry.ctor;
    const isBuilding = isBuildingCtor(targetEntityCtor);
    const isStructure = isStructureCtor(targetEntityCtor);
    if (!isBuilding && !isStructure) {
      return;
    }

    const placedEntity = new targetEntityCtor(world.allocEntityId());
    const snappedTargetX = Math.round(targetX);
    const snappedTargetY = Math.round(targetY);
    placedEntity.x = snappedTargetX;
    placedEntity.y = snappedTargetY;
    placedEntity.ownerId = this.id;
    const placedBounds = placedEntity.getWorldBounds();

    if (
      placedBounds.minX < 0 ||
      placedBounds.minY < 0 ||
      placedBounds.maxX > world.gameConfig.worldSize.w ||
      placedBounds.maxY > world.gameConfig.worldSize.h
    ) {
      return;
    }

    if (this.doHitboxesOverlap(placedEntity, this)) {
      return;
    }

    for (const blocker of world.staticGeometry.queryBox(
      placedBounds.minX,
      placedBounds.minY,
      placedBounds.maxX,
      placedBounds.maxY,
    )) {
      if (blocker.entityId === this.id) {
        continue;
      }
      if (
        doResolvedRectSetsOverlap(
          placedEntity.getWorldHitboxes(),
          blocker.hitboxes,
        )
      ) {
        return;
      }
    }

    if (
      !this.isDebugCreativeEditor() &&
      !this.inventory.consumeSelectedBuildable(1)
    ) {
      return;
    }

    world.spawn(placedEntity);
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

  private isDebugCreativeEditor(): boolean {
    return (
      process.env.NODE_ENV !== "production" &&
      this.name.toLowerCase() === "debug"
    );
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
        case "drop":
          this.dropSelectedItem(world, actionMessage.dropWholeStack);
          break;
        case "pickup":
          this.pickupNearestOverlappingItem(world);
          break;
        case "recycle":
          this.recycleSelectedItem(world);
          break;
        case "repair_tower":
          this.repairTower(world, actionMessage.towerId);
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

  private dropSelectedItem(world: World, dropWholeStack: boolean): void {
    const selectedHotbarIndex = this.inventory.selectedHotbarIndex;
    const selectedSlot = this.inventory.hotbarSlots[selectedHotbarIndex];
    if (!selectedSlot) {
      return;
    }

    const droppedInventory = new Inventory();
    if (selectedSlot.kind === "weapon") {
      this.inventory.hotbarSlots[selectedHotbarIndex] = null;
      droppedInventory.addWeapon(selectedSlot.weapon);
    } else {
      const dropCount = dropWholeStack ? selectedSlot.count : 1;
      if (dropCount <= 0) {
        return;
      }
      selectedSlot.count -= dropCount;
      if (selectedSlot.count <= 0) {
        this.inventory.hotbarSlots[selectedHotbarIndex] = null;
      }
      droppedInventory.addStackable(selectedSlot.typeId, dropCount);
    }

    this.spawnDroppedInventory(world, droppedInventory);
  }

  private spawnDroppedInventory(
    world: World,
    droppedInventory: Inventory,
  ): void {
    const pickup = new ItemEntity(world.allocEntityId(), droppedInventory);
    const dropDistance = 20;
    const aimX = Math.cos(this.rotation);
    const aimY = Math.sin(this.rotation);
    const directionX = Number.isFinite(aimX) ? aimX : 1;
    const directionY = Number.isFinite(aimY) ? aimY : 0;
    pickup.x = this.x + directionX * dropDistance;
    pickup.y = this.y + directionY * dropDistance;

    const bounds = pickup.getWorldBounds();
    if (bounds.minX < 0) {
      pickup.x -= bounds.minX;
    }
    if (bounds.maxX > world.gameConfig.worldSize.w) {
      pickup.x -= bounds.maxX - world.gameConfig.worldSize.w;
    }
    if (bounds.minY < 0) {
      pickup.y -= bounds.minY;
    }
    if (bounds.maxY > world.gameConfig.worldSize.h) {
      pickup.y -= bounds.maxY - world.gameConfig.worldSize.h;
    }

    world.spawn(pickup);
  }

  private pickupNearestOverlappingItem(world: World): void {
    const bounds = this.getWorldBounds();
    const playerHitboxes = this.getWorldHitboxes();
    let nearestPickup: ItemEntity | undefined;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const candidate of world.spatial.queryBox(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    )) {
      if (!(candidate instanceof ItemEntity)) {
        continue;
      }
      if (
        !doResolvedRectSetsOverlap(playerHitboxes, candidate.getWorldHitboxes())
      ) {
        continue;
      }
      const distanceSquared =
        (candidate.x - this.x) * (candidate.x - this.x) +
        (candidate.y - this.y) * (candidate.y - this.y);
      if (distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        nearestPickup = candidate;
      }
    }

    if (!nearestPickup) {
      return;
    }

    if (
      !absorbInventoryByAcquisitionRules(this.inventory, nearestPickup.contents)
    ) {
      return;
    }
    world.despawn(nearestPickup.id);
  }

  private recycleSelectedItem(world: World): void {
    if (!this.isNearRecycler(world)) {
      return;
    }

    const selectedIndex = this.inventory.selectedHotbarIndex;
    const slot = this.inventory.hotbarSlots[selectedIndex];
    if (!slot) {
      return;
    }

    let typeId: string;
    if (slot.kind === "weapon") {
      typeId = slot.weapon.typeId;
      if (typeId === "item:fists") {
        return;
      }
    } else {
      typeId = slot.typeId;
    }

    const hunkAmount =
      RECYCLE_HUNK_BY_ITEM[typeId] ?? (slot.kind === "weapon" ? 5 : 3);
    if (hunkAmount <= 0) {
      return;
    }

    if (slot.kind === "weapon") {
      this.inventory.hotbarSlots[selectedIndex] = null;
    } else {
      slot.count -= 1;
      if (slot.count <= 0) {
        this.inventory.hotbarSlots[selectedIndex] = null;
      }
    }

    this.inventory.addStackable("item:hunk" as ResourceId, hunkAmount);
  }

  private isNearRecycler(world: World): boolean {
    const bounds = this.getWorldBounds();
    const pad = RECYCLER_INTERACT_PADDING;
    for (const candidate of world.spatial.queryBox(
      bounds.minX - pad,
      bounds.minY - pad,
      bounds.maxX + pad,
      bounds.maxY + pad,
    )) {
      if (!(candidate instanceof Recycler)) {
        continue;
      }
      const rb = candidate.getHitboxBounds();
      if (
        this.x >= candidate.x + rb.minX - pad &&
        this.x <= candidate.x + rb.maxX + pad &&
        this.y >= candidate.y + rb.minY - pad &&
        this.y <= candidate.y + rb.maxY + pad
      ) {
        return true;
      }
    }
    return false;
  }

  private repairTower(world: World, towerId: number): void {
    const tower = world.entities.get(towerId);
    if (!(tower instanceof EnergyTower) && !(tower instanceof CommsTower)) {
      return;
    }

    const missingHp = tower.maxHp - tower.hp;
    if (missingHp <= 0 && tower.alive) {
      return;
    }

    const rb = tower.getHitboxBounds();
    const pad = TOWER_INTERACT_PADDING;
    if (
      this.x < tower.x + rb.minX - pad ||
      this.x > tower.x + rb.maxX + pad ||
      this.y < tower.y + rb.minY - pad ||
      this.y > tower.y + rb.maxY + pad
    ) {
      return;
    }

    const totalMissing = tower.alive ? missingHp : tower.maxHp;
    const repairCost = Math.ceil(totalMissing / TOWER_REPAIR_HP_DIVISOR);
    if (repairCost <= 0) {
      return;
    }

    const hunkTypeId = "item:hunk" as ResourceId;
    if (this.inventory.countType(hunkTypeId) < repairCost) {
      return;
    }

    this.inventory.consumeTypes([{ typeId: hunkTypeId, amount: repairCost }]);
    tower.hp = tower.maxHp;
    tower.alive = true;
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
    if (toSource === "chest" && (toIndex < 0 || toIndex >= CHEST_SLOT_COUNT)) {
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
      this.writeSlotValue(toSource, toIndex, chestEntity, {
        kind: "buildable",
        typeId: toValue.typeId,
        count: stacked,
      });
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
