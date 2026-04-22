import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { getItemContent } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { itemTypeRegistry } from "@server/registry/registries.ts";
import { isWeaponCtor } from "@server/runtime/ctorGuards.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

const MAG_PICKUP_TYPE_IDS = [
  "item:gun_mag",
  "item:crossbow_mag",
  "item:drone_mag",
] as const;

const WEAPON_PICKUP_TYPE_IDS = [
  "item:basic_spear",
  "item:lead_pipe",
  "item:baseball_bat",
  "item:basic_dagger",
] as const satisfies readonly ResourceId[];
const BLUEPRINT_PICKUP_TYPE_IDS = [
  "item:blueprint_spiked_spear",
  "item:blueprint_basic_rifle",
  "item:blueprint_sniper",
] as const satisfies readonly ResourceId[];

const MAG_PICKUP_SPAWN_INTERVAL_MS = 8000;
const MAX_ACTIVE_MAG_PICKUPS = 8;

const WEAPON_PICKUP_SPAWN_INTERVAL_MS = 20000;
const MAX_ACTIVE_WEAPON_PICKUPS = 4;

const BLUEPRINT_PICKUP_SPAWN_INTERVAL_MS = 60000;
const MAX_ACTIVE_BLUEPRINT_PICKUPS = 2;

const FOOD_PICKUP_TYPE_IDS = [
  "item:junk_food",
  "item:quality_food",
] as const satisfies readonly ResourceId[];
const FOOD_PICKUP_SPAWN_INTERVAL_MS = 10000;
const MAX_ACTIVE_FOOD_PICKUPS = 8;

const SPAWN_ATTEMPTS = 20;

/**
 * Spawns consumable pickups (mags, weapons, blueprints).
 */
export class PickupSystem implements System {
  private magAccumulatedMs = 0;
  private weaponAccumulatedMs = 0;
  private blueprintAccumulatedMs = 0;
<<<<<<< HEAD
  private activeBlueprintPickupCount = 0;
  private activeBlueprintPickupCountInitialized = false;

  private foodAccumulatedMs = 0;
  private activeFoodPickupCount = 0;
  private activeFoodPickupCountInitialized = false;

  private readonly queryBuffer: ItemEntity[] = [];
=======
  private readonly queryBuffer: Entity[] = [];
>>>>>>> 7dc093c4840d9a7bce7e1a00d5a35e9d2a22bffe

  public update(world: World, deltaMs: number): void {
    this.mergeOverlappingStackablePickups(world);

    let activeMagPickupCount = 0;
    let activeWeaponPickupCount = 0;
    let activeBlueprintPickupCount = 0;
    for (const pickup of world.entities.queryInstances(ItemEntity)) {
      if (this.isMagPickup(pickup)) {
        activeMagPickupCount += 1;
      } else if (this.isWeaponPickup(pickup)) {
        activeWeaponPickupCount += 1;
      } else if (this.isBlueprintPickup(pickup)) {
        activeBlueprintPickupCount += 1;
      }
    }

<<<<<<< HEAD
    if (!this.activeBlueprintPickupCountInitialized) {
      this.activeBlueprintPickupCount = world.entities
        .queryInstances(ItemEntity)
        .filter((pickup) => this.isBlueprintPickup(pickup)).length;
      this.activeBlueprintPickupCountInitialized = true;
    }

    if (!this.activeFoodPickupCountInitialized) {
      this.activeFoodPickupCount = world.entities
        .queryInstances(ItemEntity)
        .filter((pickup) => this.isFoodPickup(pickup)).length;
      this.activeFoodPickupCountInitialized = true;
    }

    this.collectPickups(world);

=======
>>>>>>> 7dc093c4840d9a7bce7e1a00d5a35e9d2a22bffe
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
      if (this.activeFoodPickupCount < MAX_ACTIVE_FOOD_PICKUPS) {
        this.spawnRandomFoodPickup(world);
      }
    }
  }

  private mergeOverlappingStackablePickups(world: World): void {
    const removedPickupIds = new Set<number>();
    const pickups = world.entities.queryInstances(ItemEntity);

    for (const pickup of pickups) {
      if (removedPickupIds.has(pickup.id) || !world.entities.has(pickup.id)) {
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
          removedPickupIds.has(candidate.id) ||
          !world.entities.has(candidate.id)
        ) {
          continue;
        }
<<<<<<< HEAD

        if (this.isMagPickup(pickup)) {
          if (!player.inventory.absorbInventory(pickup.contents)) {
            continue;
          }
          this.activeMagPickupCount = Math.max(0, this.activeMagPickupCount - 1);
          world.despawn(pickup.id);
        } else if (this.isWeaponPickup(pickup)) {
          if (!player.inventory.absorbInventory(pickup.contents)) {
            continue;
          }
          this.activeWeaponPickupCount = Math.max(
            0,
            this.activeWeaponPickupCount - 1,
          );
          world.despawn(pickup.id);
        } else if (this.isBlueprintPickup(pickup)) {
          if (!player.inventory.absorbInventory(pickup.contents)) {
            continue;
          }
          this.activeBlueprintPickupCount = Math.max(
            0,
            this.activeBlueprintPickupCount - 1,
          );
          world.despawn(pickup.id);
        } else if (this.isFoodPickup(pickup)) {
          const foodTypeId = FOOD_PICKUP_TYPE_IDS.find(
            (typeId) => pickup.contents.getStackableCount(typeId) > 0,
          );
          const foodRestore = foodTypeId
            ? (getItemContent(foodTypeId)?.food?.foodRestore ?? 0)
            : 0;
          player.food = Math.min(player.maxFood, player.food + foodRestore);
          this.activeFoodPickupCount = Math.max(0, this.activeFoodPickupCount - 1);
          world.despawn(pickup.id);
=======
        if (!pickup.canMergeStackableWith(candidate)) {
          continue;
>>>>>>> 7dc093c4840d9a7bce7e1a00d5a35e9d2a22bffe
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
        removedPickupIds.add(candidate.id);
      }
    }
  }

  private spawnRandomMagPickup(world: World): void {
    const typeId = this.pickRandomTypeId(world, MAG_PICKUP_TYPE_IDS);
    const inventory = new Inventory();
    inventory.addStackable(typeId, 1);
    this.trySpawnPickup(world, inventory);
  }

  private spawnRandomWeaponPickup(world: World): void {
    const typeId = this.pickRandomTypeId(world, WEAPON_PICKUP_TYPE_IDS);
    const weaponEntry = itemTypeRegistry.get(typeId);
    if (!weaponEntry || !isWeaponCtor(weaponEntry.ctor)) {
      return;
    }
    const inventory = new Inventory();
    inventory.addWeapon(new weaponEntry.ctor());
    this.trySpawnPickup(world, inventory);
  }

  private spawnRandomBlueprintPickup(world: World): void {
    const typeId = this.pickRandomTypeId(world, BLUEPRINT_PICKUP_TYPE_IDS);
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

      const overlapsEntity = world.spatial
        .queryBox(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)
        .some((entity) =>
          doResolvedRectSetsOverlap(
            pickup.getWorldHitboxes(),
            entity.getWorldHitboxes(),
          ),
        );
      if (overlapsEntity) {
        continue;
      }

      world.spawn(pickup);
      return true;
    }
    return false;
  }

  private spawnRandomFoodPickup(world: World): void {
    const typeId = this.pickRandomTypeId(world, FOOD_PICKUP_TYPE_IDS);
    const inventory = new Inventory();
    inventory.addStackable(typeId, 1);
    if (this.trySpawnPickup(world, inventory)) {
      this.activeFoodPickupCount += 1;
    }
  }

  private isFoodPickup(pickup: ItemEntity): boolean {
    return FOOD_PICKUP_TYPE_IDS.some(
      (typeId) => pickup.contents.getStackableCount(typeId) > 0,
    );
  }

  private isMagPickup(pickup: ItemEntity): boolean {
    return MAG_PICKUP_TYPE_IDS.some(
      (typeId) => pickup.contents.getStackableCount(typeId) > 0,
    );
  }

  private isWeaponPickup(pickup: ItemEntity): boolean {
    return WEAPON_PICKUP_TYPE_IDS.some(
      (typeId) => pickup.contents.getStackableCount(typeId) > 0,
    );
  }

  private isBlueprintPickup(pickup: ItemEntity): boolean {
    return BLUEPRINT_PICKUP_TYPE_IDS.some(
      (typeId) => pickup.contents.getStackableCount(typeId) > 0,
    );
  }

  private pickRandomTypeId<T extends ResourceId>(
    world: World,
    typeIds: readonly [T, ...T[]],
  ): T {
    const index = Math.floor(world.randomNumberGenerator() * typeIds.length);
    return typeIds[index] ?? typeIds[0];
  }
}
