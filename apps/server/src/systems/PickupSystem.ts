import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

const MAG_PICKUP_TYPE_IDS = ["item:gun_mag", "item:crossbow_mag"] as const;
const PICKUP_SPAWN_INTERVAL_MS = 8000;
const MAX_ACTIVE_MAG_PICKUPS = 8;
const SPAWN_ATTEMPTS = 20;

/**
 * Spawns consumable mag pickups and grants them on player overlap.
 */
export class PickupSystem implements System {
  private accumulatedSpawnMs = 0;

  public update(world: World, deltaMs: number): void {
    this.collectPickups(world);

    this.accumulatedSpawnMs += deltaMs;
    while (this.accumulatedSpawnMs >= PICKUP_SPAWN_INTERVAL_MS) {
      this.accumulatedSpawnMs -= PICKUP_SPAWN_INTERVAL_MS;
      if (this.countActiveMagPickups(world) < MAX_ACTIVE_MAG_PICKUPS) {
        this.spawnRandomMagPickup(world);
      }
    }
  }

  private collectPickups(world: World): void {
    const players = world.entities.queryInstances(Player);
    const pickups = world.entities.queryInstances(ItemEntity);

    for (const player of players) {
      if (!player.alive) {
        continue;
      }

      for (const pickup of pickups) {
        if (!world.entities.has(pickup.id)) {
          continue;
        }
        if (
          !doResolvedRectSetsOverlap(
            player.getWorldHitboxes(),
            pickup.getWorldHitboxes(),
          )
        ) {
          continue;
        }

        for (const [typeId, amount] of pickup.contents.stackables.entries()) {
          player.inventory.addStackable(typeId, amount);
        }
        for (const weapon of pickup.contents.weapons) {
          player.inventory.addWeapon(weapon);
        }
        world.despawn(pickup.id);
      }
    }
  }

  private countActiveMagPickups(world: World): number {
    return world.entities
      .queryInstances(ItemEntity)
      .filter((pickup) =>
        MAG_PICKUP_TYPE_IDS.some(
          (typeId) => pickup.contents.getStackableCount(typeId) > 0,
        ),
      ).length;
  }

  private spawnRandomMagPickup(world: World): void {
    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
      const typeId = this.pickRandomMagType(world);
      const inventory = new Inventory();
      inventory.addStackable(typeId, 1);

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
        world.despawn(pickup.id);
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
        world.despawn(pickup.id);
        continue;
      }

      world.spawn(pickup);
      return;
    }
  }

  private pickRandomMagType(world: World): ResourceId {
    const index = Math.floor(
      world.randomNumberGenerator() * MAG_PICKUP_TYPE_IDS.length,
    );
    return MAG_PICKUP_TYPE_IDS[index] ?? MAG_PICKUP_TYPE_IDS[0];
  }
}
