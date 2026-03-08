import Denque from "denque";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

/**
 * Stores recent authoritative snapshots for interpolation.
 * Snapshot history is bounded so the client does not grow unbounded memory.
 */
export class ClientWorldState {
  history: Denque<WorldSnapshot>;
  latest?: WorldSnapshot;
  private readonly maxHistorySize: number;

  /**
   * Creates bounded snapshot storage with fixed capacity.
   * @param capacity Maximum number of snapshots to retain.
   */
  constructor(capacity: number) {
    this.maxHistorySize = Math.max(1, Math.floor(capacity));
    this.history = new Denque<WorldSnapshot>();
  }

  /**
   * Adds a snapshot and enforces the configured history capacity.
   * @param s Authoritative snapshot to append.
   */
  pushSnapshot(s: WorldSnapshot): void {
    this.latest = s;
    if (this.history.length >= this.maxHistorySize) {
      this.history.shift();
    }
    this.history.push(s);
  }

  /**
   * Returns the most recently received snapshot.
   * @returns Latest authoritative snapshot when present.
   */
  getLatest(): WorldSnapshot | undefined {
    return this.latest;
  }

  /**
   * Returns a copy of snapshot history in arrival order.
   * @returns Snapshot history from oldest to newest.
   */
  getHistory(): WorldSnapshot[] {
    return this.history.toArray();
  }
}
