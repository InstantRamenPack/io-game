import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { getBlueprintUnlockedRecipeTypeId } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
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

const SPAWN_ATTEMPTS = 20;

/**
 * Spawns consumable pickups (mags, weapons, blueprints) and grants them on player overlap.
 */
export class PickupSystem implements System {
  private magAccumulatedMs = 0;
  private activeMagPickupCount = 0;
  private activeMagPickupCountInitialized = false;

  private weaponAccumulatedMs = 0;
  private activeWeaponPickupCount = 0;
  private activeWeaponPickupCountInitialized = false;

  private blueprintAccumulatedMs = 0;
  private activeBlueprintPickupCount = 0;
  private activeBlueprintPickupCountInitialized = false;

  private readonly queryBuffer: ItemEntity[] = [];

  public update(world: World, deltaMs: number): void {
    if (!this.activeMagPickupCountInitialized) {
      this.activeMagPickupCount = world.entities
        .queryInstances(ItemEntity)
        .filter((pickup) => this.isMagPickup(pickup)).length;
      this.activeMagPickupCountInitialized = true;
    }

    if (!this.activeWeaponPickupCountInitialized) {
      this.activeWeaponPickupCount = world.entities
        .queryInstances(ItemEntity)
        .filter((pickup) => this.isWeaponPickup(pickup)).length;
      this.activeWeaponPickupCountInitialized = true;
    }

    if (!this.activeBlueprintPickupCountInitialized) {
      this.activeBlueprintPickupCount = world.entities
        .queryInstances(ItemEntity)
        .filter((pickup) => this.isBlueprintPickup(pickup)).length;
      this.activeBlueprintPickupCountInitialized = true;
    }

    this.collectPickups(world);

    this.magAccumulatedMs += deltaMs;
    while (this.magAccumulatedMs >= MAG_PICKUP_SPAWN_INTERVAL_MS) {
      this.magAccumulatedMs -= MAG_PICKUP_SPAWN_INTERVAL_MS;
      if (this.activeMagPickupCount < MAX_ACTIVE_MAG_PICKUPS) {
        this.spawnRandomMagPickup(world);
      }
    }

    this.weaponAccumulatedMs += deltaMs;
    while (this.weaponAccumulatedMs >= WEAPON_PICKUP_SPAWN_INTERVAL_MS) {
      this.weaponAccumulatedMs -= WEAPON_PICKUP_SPAWN_INTERVAL_MS;
      if (this.activeWeaponPickupCount < MAX_ACTIVE_WEAPON_PICKUPS) {
        this.spawnRandomWeaponPickup(world);
      }
    }

    this.blueprintAccumulatedMs += deltaMs;
    while (this.blueprintAccumulatedMs >= BLUEPRINT_PICKUP_SPAWN_INTERVAL_MS) {
      this.blueprintAccumulatedMs -= BLUEPRINT_PICKUP_SPAWN_INTERVAL_MS;
      if (this.activeBlueprintPickupCount < MAX_ACTIVE_BLUEPRINT_PICKUPS) {
        this.spawnRandomBlueprintPickup(world);
      }
    }
  }

  private collectPickups(world: World): void {
    const players = world.entities.queryInstances(Player);

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
        const pickup = candidate;
        if (!world.entities.has(pickup.id)) {
          continue;
        }
        if (
          !doResolvedRectSetsOverlap(playerHitboxes, pickup.getWorldHitboxes())
        ) {
          continue;
        }

        if (this.isMagPickup(pickup)) {
          if (!player.inventory.absorbInventory(pickup.contents)) {
            continue;
          }
          this.activeMagPickupCount = Math.max(
            0,
            this.activeMagPickupCount - 1,
          );
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
          this.unlockBlueprintPickupRecipes(player.inventory, pickup.contents);
          this.activeBlueprintPickupCount = Math.max(
            0,
            this.activeBlueprintPickupCount - 1,
          );
          world.despawn(pickup.id);
        }
      }
    }
  }

  private spawnRandomMagPickup(world: World): void {
    const typeId = this.pickRandomTypeId(world, MAG_PICKUP_TYPE_IDS);
    const inventory = new Inventory();
    inventory.addStackable(typeId, 1);
    if (this.trySpawnPickup(world, inventory)) {
      this.activeMagPickupCount += 1;
    }
  }

  private spawnRandomWeaponPickup(world: World): void {
    const typeId = this.pickRandomTypeId(world, WEAPON_PICKUP_TYPE_IDS);
    const weaponEntry = itemTypeRegistry.get(typeId);
    if (!weaponEntry || !isWeaponCtor(weaponEntry.ctor)) {
      return;
    }
    const inventory = new Inventory();
    inventory.addWeapon(new weaponEntry.ctor());
    if (this.trySpawnPickup(world, inventory)) {
      this.activeWeaponPickupCount += 1;
    }
  }

  private spawnRandomBlueprintPickup(world: World): void {
    const typeId = this.pickRandomTypeId(world, BLUEPRINT_PICKUP_TYPE_IDS);
    const inventory = new Inventory();
    inventory.addStackable(typeId, 1);
    if (this.trySpawnPickup(world, inventory)) {
      this.activeBlueprintPickupCount += 1;
    }
  }

  private unlockBlueprintPickupRecipes(
    inventory: Inventory,
    pickupContents: Inventory,
  ): void {
    for (const blueprintTypeId of BLUEPRINT_PICKUP_TYPE_IDS) {
      if (pickupContents.getStackableCount(blueprintTypeId) <= 0) {
        continue;
      }

      const unlockedRecipeTypeId =
        getBlueprintUnlockedRecipeTypeId(blueprintTypeId);
      if (!unlockedRecipeTypeId) {
        continue;
      }
      inventory.unlockRecipe(unlockedRecipeTypeId);
    }
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
