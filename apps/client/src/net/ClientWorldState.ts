import type {
  EntitySnapshot,
  WorldSnapshot,
} from "@shared/net/snapshots.ts";

/**
 * Stores the latest authoritative snapshot plus a client-side present-state view.
 * The present-state entities are reset from snapshots and advanced locally until
 * the next authoritative update arrives.
 */
export class ClientWorldState {
  latest?: WorldSnapshot;
  private entities = new Map<number, EntitySnapshot>();

  /**
   * Creates empty client-side world state.
   */
  constructor() {}

  /**
   * Replaces the local present-state with a fresh authoritative snapshot.
   * @param snapshot Authoritative snapshot to apply.
   */
  pushSnapshot(snapshot: WorldSnapshot): void {
    this.latest = snapshot;
    this.entities.clear();
    for (const entity of snapshot.entities) {
      this.entities.set(entity.id, { ...entity });
    }
  }

  /**
   * Returns the most recently received snapshot.
   * @returns Latest authoritative snapshot when present.
   */
  getLatest(): WorldSnapshot | undefined {
    return this.latest;
  }

  /**
   * Clears both authoritative and locally extrapolated client state.
   */
  clear(): void {
    this.latest = undefined;
    this.entities.clear();
  }

  /**
   * Advances locally presented entities using their authoritative velocities.
   * @param deltaMs Frame delta in milliseconds.
   */
  advance(deltaMs: number): void {
    const deltaSeconds = deltaMs / 1000;
    for (const entity of this.entities.values()) {
      entity.x += entity.vx * deltaSeconds;
      entity.y += entity.vy * deltaSeconds;
    }
  }

  /**
   * Returns a copy of the locally presented entity state keyed by id.
   * @returns Extrapolated entity map.
   */
  getEntities(): Map<number, EntitySnapshot> {
    return new Map(
      Array.from(this.entities.entries(), ([id, entity]) => [id, { ...entity }]),
    );
  }
}
