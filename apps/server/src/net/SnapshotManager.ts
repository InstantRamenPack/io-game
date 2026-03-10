import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

/**
 * Controls snapshot cadence and serialization from authoritative world state.
 * This isolates snapshot timing from GameServer.
 */
export class SnapshotManager {
  private readonly everyTicks: number;

  /**
   * Creates cadence logic from snapshot and simulation tick rates.
   * @param snapshotRate Desired snapshots per second.
   * @param tickRate Simulation ticks per second.
   */
  constructor(snapshotRate: number, tickRate: number) {
    const safeSnapshotRate = Math.max(1, snapshotRate);
    this.everyTicks = Math.max(1, Math.floor(tickRate / safeSnapshotRate));
  }

  /**
   * Returns whether the current tick should emit a snapshot.
   * @param tick Current world tick.
   * @returns True when a snapshot should be generated.
   */
  shouldSendSnapshot(tick: number): boolean {
    return tick % this.everyTicks === 0;
  }

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
      timeMs: world.timeMs,
      entities: world.entities.all().map((entity) => entity.toSnapshot()),
      events: drainedEvents,
    };
  }
}
