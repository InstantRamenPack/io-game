import type { Entity } from "@server/entities/Entity.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";

/**
 * Merges stackable pickups. Item collection is intentionally explicit through
 * the pickup action so every dropped item requires player input.
 */
export class PickupSystem implements System {
  private readonly queryBuffer: Entity[] = [];
  private readonly removedPickupIds = new Set<number>();

  public update(world: World, deltaMs: number): void {
    void deltaMs;
    this.mergeOverlappingStackablePickups(
      world,
      world.entities.queryInstances(ItemEntity),
    );
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
}
