import { getItemContent } from "@shared/content/catalog.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  getWorldWeaponPickupTypeIds,
  requiresManualPickup,
  WORLD_BLUEPRINT_PICKUP_TYPE_IDS,
  WORLD_FOOD_PICKUP_TYPE_IDS,
  WORLD_MAG_PICKUP_TYPE_IDS,
} from "@server/content/serverContentCapabilities.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { itemTypeRegistry } from "@server/registry/registries.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

const MAG_PICKUP_SPAWN_INTERVAL_MS = 8000;
const MAX_ACTIVE_MAG_PICKUPS = 8;

const WEAPON_PICKUP_SPAWN_INTERVAL_MS = 20000;
const MAX_ACTIVE_WEAPON_PICKUPS = 4;

const BLUEPRINT_PICKUP_SPAWN_INTERVAL_MS = 60000;
const MAX_ACTIVE_BLUEPRINT_PICKUPS = 2;

const FOOD_PICKUP_SPAWN_INTERVAL_MS = 10000;
const MAX_ACTIVE_FOOD_PICKUPS = 8;

const SPAWN_ATTEMPTS = 20;

/**
 * Spawns consumable pickups (mags, weapons, blueprints, food) and auto-collects
 * non-weapon, non-buildable pickups on player overlap.
 */
export class PickupSystem implements System {
  private magAccumulatedMs = 0;
  private weaponAccumulatedMs = 0;
  private blueprintAccumulatedMs = 0;
  private foodAccumulatedMs = 0;
  private readonly queryBuffer: Entity[] = [];
  private readonly spawnQueryBuffer: Entity[] = [];
  private readonly removedPickupIds = new Set<number>();

  public update(world: World, deltaMs: number): void {
    this.mergeOverlappingStackablePickups(
      world,
      world.entities.queryInstances(ItemEntity),
    );

    let activeMagPickupCount = 0;
    let activeWeaponPickupCount = 0;
    let activeBlueprintPickupCount = 0;
    let activeFoodPickupCount = 0;
    for (const pickup of world.entities.queryInstances(ItemEntity)) {
      if (this.isMagPickup(pickup)) {
        activeMagPickupCount += 1;
      } else if (this.isWeaponPickup(pickup)) {
        activeWeaponPickupCount += 1;
      } else if (this.isBlueprintPickup(pickup)) {
        activeBlueprintPickupCount += 1;
      } else if (this.isFoodPickup(pickup)) {
        activeFoodPickupCount += 1;
      }
    }

    this.collectAutoPickups(world, world.entities.queryInstances(Player));

    this.magAccumulatedMs += deltaMs;
    while (this.magAccumulatedMs >= MAG_PICKUP_SPAWN_INTERVAL_MS) {
      this.magAccumulatedMs -= MAG_PICKUP_SPAWN_INTERVAL_MS;
      if (activeMagPickupCount < MAX_ACTIVE_MAG_PICKUPS) {
        this.spawnRandomMagPickup(world);
        activeMagPickupCount += 1;
      }
    }

    this.weaponAccumulatedMs += deltaMs;
    while (this.weaponAccumulatedMs >= WEAPON_PICKUP_SPAWN_INTERVAL_MS) {
      this.weaponAccumulatedMs -= WEAPON_PICKUP_SPAWN_INTERVAL_MS;
      if (activeWeaponPickupCount < MAX_ACTIVE_WEAPON_PICKUPS) {
        this.spawnRandomWeaponPickup(world);
        activeWeaponPickupCount += 1;
      }
    }

    this.blueprintAccumulatedMs += deltaMs;
    while (this.blueprintAccumulatedMs >= BLUEPRINT_PICKUP_SPAWN_INTERVAL_MS) {
      this.blueprintAccumulatedMs -= BLUEPRINT_PICKUP_SPAWN_INTERVAL_MS;
      if (activeBlueprintPickupCount < MAX_ACTIVE_BLUEPRINT_PICKUPS) {
        this.spawnRandomBlueprintPickup(world);
        activeBlueprintPickupCount += 1;
      }
    }

    this.foodAccumulatedMs += deltaMs;
    while (this.foodAccumulatedMs >= FOOD_PICKUP_SPAWN_INTERVAL_MS) {
      this.foodAccumulatedMs -= FOOD_PICKUP_SPAWN_INTERVAL_MS;
      if (activeFoodPickupCount < MAX_ACTIVE_FOOD_PICKUPS) {
        this.spawnRandomFoodPickup(world);
        activeFoodPickupCount += 1;
      }
    }
  }

  private collectAutoPickups(world: World, players: readonly Player[]): void {
    for (const player of players) {
      if (!player.alive) {
        continue;
      }
      const bounds = player.getWorldBounds();
      const candidates = world.spatial.queryBox(
        bounds.minX,
        bounds.minY,
        bounds.maxX,
        bounds.maxY,
        this.queryBuffer,
      );
      const playerHitboxes = player.getWorldHitboxes();

      for (const candidate of candidates) {
        if (!(candidate instanceof ItemEntity)) {
          continue;
        }
        if (!world.entities.has(candidate.id)) {
          continue;
        }
        if (!this.shouldAutoPickup(candidate)) {
          continue;
        }
        if (
          !doResolvedRectSetsOverlap(
            playerHitboxes,
            candidate.getWorldHitboxes(),
          )
        ) {
          continue;
        }

        const transferable = this.buildAutoPickupInventory(player, candidate);
        if (!player.inventory.absorbInventoryByAcquisitionRules(transferable)) {
          continue;
        }
        world.despawn(candidate.id);
      }
    }
  }

  private mergeOverlappingStackablePickups(
    world: World,
    pickups: readonly ItemEntity[],
  ): void {
    this.removedPickupIds.clear();

    for (const pickup of pickups) {
      if (
        this.removedPickupIds.has(pickup.id) ||
        !world.entities.has(pickup.id)
      ) {
        continue;
      }
      if (!pickup.getSingleStackable()) {
        continue;
      }

      const bounds = pickup.getWorldBounds();
      const candidates = world.spatial.queryBox(
        bounds.minX,
        bounds.minY,
        bounds.maxX,
        bounds.maxY,
        this.queryBuffer,
      );

      for (const candidate of candidates) {
        if (
          !(candidate instanceof ItemEntity) ||
          candidate.id === pickup.id ||
          this.removedPickupIds.has(candidate.id) ||
          !world.entities.has(candidate.id)
        ) {
          continue;
        }
        if (!pickup.canMergeStackableWith(candidate)) {
          continue;
        }
        if (
          !doResolvedRectSetsOverlap(
            pickup.getWorldHitboxes(),
            candidate.getWorldHitboxes(),
          )
        ) {
          continue;
        }
        if (!pickup.mergeStackableFrom(candidate)) {
          continue;
        }

        world.despawn(candidate.id);
        this.removedPickupIds.add(candidate.id);
      }
    }
  }

  private spawnRandomMagPickup(world: World): void {
    const typeId = this.pickRandomTypeId(world, WORLD_MAG_PICKUP_TYPE_IDS);
    if (!typeId) {
      return;
    }
    const inventory = new Inventory();
    inventory.addStackable(typeId, 1);
    this.trySpawnPickup(world, inventory);
  }

  private spawnRandomWeaponPickup(world: World): void {
    const typeId = this.pickRandomTypeId(world, getWorldWeaponPickupTypeIds());
    if (!typeId) {
      return;
    }
    const weaponEntry = itemTypeRegistry.get(typeId);
    if (!weaponEntry) {
      return;
    }
    const inventory = new Inventory();
    inventory.grantItemCtor(weaponEntry.ctor, 1);
    this.trySpawnPickup(world, inventory);
  }

  private spawnRandomBlueprintPickup(world: World): void {
    const typeId = this.pickRandomTypeId(
      world,
      WORLD_BLUEPRINT_PICKUP_TYPE_IDS,
    );
    if (!typeId) {
      return;
    }
    const inventory = new Inventory();
    inventory.addStackable(typeId, 1);
    this.trySpawnPickup(world, inventory);
  }

  private spawnRandomFoodPickup(world: World): void {
    const typeId = this.pickRandomTypeId(world, WORLD_FOOD_PICKUP_TYPE_IDS);
    if (!typeId) {
      return;
    }
    const inventory = new Inventory();
    inventory.addStackable(typeId, 1);
    this.trySpawnPickup(world, inventory);
  }

  private trySpawnPickup(world: World, inventory: Inventory): boolean {
    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
      const pickup = new ItemEntity(world.allocEntityId(), inventory);
      pickup.x = world.randomNumberGenerator() * world.gameConfig.worldSize.w;
      pickup.y = world.randomNumberGenerator() * world.gameConfig.worldSize.h;

      const bounds = pickup.getWorldBounds();
      if (
        bounds.minX < 0 ||
        bounds.minY < 0 ||
        bounds.maxX > world.gameConfig.worldSize.w ||
        bounds.maxY > world.gameConfig.worldSize.h
      ) {
        continue;
      }

      const overlapCandidates = world.spatial.queryBox(
        bounds.minX,
        bounds.minY,
        bounds.maxX,
        bounds.maxY,
        this.spawnQueryBuffer,
      );
      let overlapsEntity = false;
      for (const entity of overlapCandidates) {
        if (
          doResolvedRectSetsOverlap(
            pickup.getWorldHitboxes(),
            entity.getWorldHitboxes(),
          )
        ) {
          overlapsEntity = true;
          break;
        }
      }
      if (overlapsEntity) {
        continue;
      }

      world.spawn(pickup);
      return true;
    }
    return false;
  }

  private isFoodPickup(pickup: ItemEntity): boolean {
    return WORLD_FOOD_PICKUP_TYPE_IDS.some(
      (typeId) => pickup.contents.getStackableCount(typeId) > 0,
    );
  }

  private isMagPickup(pickup: ItemEntity): boolean {
    return WORLD_MAG_PICKUP_TYPE_IDS.some(
      (typeId) => pickup.contents.getStackableCount(typeId) > 0,
    );
  }

  private isWeaponPickup(pickup: ItemEntity): boolean {
    return getWorldWeaponPickupTypeIds().some(
      (typeId) => pickup.contents.getStackableCount(typeId) > 0,
    );
  }

  private isBlueprintPickup(pickup: ItemEntity): boolean {
    return WORLD_BLUEPRINT_PICKUP_TYPE_IDS.some(
      (typeId) => pickup.contents.getStackableCount(typeId) > 0,
    );
  }

  private shouldAutoPickup(pickup: ItemEntity): boolean {
    for (const [typeId, amount] of pickup.contents.resources.entries()) {
      if (amount > 0 && requiresManualPickup(typeId)) {
        return false;
      }
    }

    for (const slot of pickup.contents.hotbarSlots) {
      if (!slot) {
        continue;
      }
      if (slot.kind === "weapon") {
        return false;
      }
      if (slot.count > 0 && requiresManualPickup(slot.typeId)) {
        return false;
      }
    }

    return true;
  }

  private buildAutoPickupInventory(
    player: Player,
    pickup: ItemEntity,
  ): Inventory {
    const transferable = new Inventory();

    for (const [typeId, amount] of pickup.contents.resources.entries()) {
      if (amount <= 0) {
        continue;
      }
      if (this.applyDirectPickupEffect(player, typeId, amount)) {
        continue;
      }
      transferable.addStackable(typeId, amount);
    }

    for (const slot of pickup.contents.hotbarSlots) {
      if (!slot) {
        continue;
      }
      if (slot.kind === "weapon") {
        transferable.addWeapon(slot.weapon);
        continue;
      }
      if (slot.count <= 0) {
        continue;
      }
      if (this.applyDirectPickupEffect(player, slot.typeId, slot.count)) {
        continue;
      }
      transferable.addStackable(slot.typeId, slot.count);
    }

    for (const unlockedRecipeTypeId of pickup.contents.getUnlockedRecipeTypeIds()) {
      transferable.unlockRecipe(unlockedRecipeTypeId);
    }

    return transferable;
  }

  private applyDirectPickupEffect(
    player: Player,
    typeId: ResourceId,
    amount: number,
  ): boolean {
    const foodRestore = getItemContent(typeId)?.food?.foodRestore;
    if (foodRestore === undefined) {
      return false;
    }
    player.food = Math.min(player.maxFood, player.food + foodRestore * amount);
    return true;
  }

  private pickRandomTypeId<T extends ResourceId>(
    world: World,
    typeIds: readonly T[],
  ): T | undefined {
    if (typeIds.length === 0) {
      return undefined;
    }
    const index = Math.floor(world.randomNumberGenerator() * typeIds.length);
    return typeIds[index] ?? typeIds[0];
  }
}
