import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

const MAG_PICKUP_TYPE_IDS = [
  "item:gun_mag",
  "item:crossbow_mag",
  "item:drone_mag",
] as const;
const PICKUP_SPAWN_INTERVAL_MS = 8000;
const MAX_ACTIVE_MAG_PICKUPS = 8;
const SPAWN_ATTEMPTS = 20;

/**
 * Spawns consumable mag pickups and grants them on player overlap.
 */
export class PickupSystem implements System {
  private accumulatedSpawnMs = 0;
  private activeMagPickupCount = 0;
  private activeMagPickupCountInitialized = false;
  private readonly queryBuffer: ItemEntity[] = [];

  public update(world: World, deltaMs: number): void {
    if (!this.activeMagPickupCountInitialized) {
      this.activeMagPickupCount = world.entities
        .queryInstances(ItemEntity)
        .filter((pickup) => this.isMagPickup(pickup)).length;
      this.activeMagPickupCountInitialized = true;
    }

    this.collectPickups(world);

    this.accumulatedSpawnMs += deltaMs;
    while (this.accumulatedSpawnMs >= PICKUP_SPAWN_INTERVAL_MS) {
      this.accumulatedSpawnMs -= PICKUP_SPAWN_INTERVAL_MS;
      if (this.activeMagPickupCount < MAX_ACTIVE_MAG_PICKUPS) {
        this.spawnRandomMagPickup(world);
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
        if (!this.isMagPickup(pickup)) {
          continue;
        }
        if (
          !doResolvedRectSetsOverlap(playerHitboxes, pickup.getWorldHitboxes())
        ) {
          continue;
        }

        if (!player.inventory.absorbInventory(pickup.contents)) {
          continue;
        }
        this.activeMagPickupCount = Math.max(0, this.activeMagPickupCount - 1);
        world.despawn(pickup.id);
      }
    }
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
      this.activeMagPickupCount += 1;
      return;
    }
  }

  private isMagPickup(pickup: ItemEntity): boolean {
    return MAG_PICKUP_TYPE_IDS.some(
      (typeId) => pickup.contents.getStackableCount(typeId) > 0,
    );
  }

  private pickRandomMagType(world: World): ResourceId {
    const index = Math.floor(
      world.randomNumberGenerator() * MAG_PICKUP_TYPE_IDS.length,
    );
    return MAG_PICKUP_TYPE_IDS[index] ?? MAG_PICKUP_TYPE_IDS[0];
  }
}
