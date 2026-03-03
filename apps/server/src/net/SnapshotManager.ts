import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

/** Controls snapshot cadence and serialization from world state. */
export class SnapshotManager {
  private readonly everyTicks: number;

  /** Creates cadence logic from snapshot and simulation tick rates. */
  constructor(snapshotRate: number, tickRate: number) {
    const safeSnapshotRate = Math.max(1, snapshotRate);
    this.everyTicks = Math.max(1, Math.floor(tickRate / safeSnapshotRate));
  }

  /** Returns true when the current tick should emit a snapshot. */
  shouldSendSnapshot(tick: number): boolean {
    return tick % this.everyTicks === 0;
  }

  /** Builds a snapshot and drains pending world events. */
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
