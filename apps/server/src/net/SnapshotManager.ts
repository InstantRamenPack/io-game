import type { EntitySnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

/**
 * Serializes authoritative world state after each completed server tick.
 * This keeps snapshot construction concerns out of GameServer.
 */
export class SnapshotManager {
  /**
   * Builds a snapshot and drains any pending world events.
   * @param world Authoritative world to serialize.
   * @returns Serialized snapshot for the current tick.
   */
  makeSnapshot(world: World): WorldSnapshot {
    const drainedEvents = world.events.toArray();
    world.events.clear();

    return {
      tick: world.tick,
      dayNight: world.dayNightCycle.toSnapshot(),
      entities: world.entities
        .all()
        .map((entity) => entity.toSnapshot() as EntitySnapshot),
      events: drainedEvents,
    };
  }
}
