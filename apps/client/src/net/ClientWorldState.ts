import Denque from "denque";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

/** Stores recent authoritative snapshots for interpolation. */
export class ClientWorldState {
  history: Denque<WorldSnapshot>;
  latest?: WorldSnapshot;
  private readonly maxHistorySize: number;

  /** Creates bounded snapshot storage with fixed capacity. */
  constructor(capacity: number) {
    this.maxHistorySize = Math.max(1, Math.floor(capacity));
    this.history = new Denque<WorldSnapshot>();
  }

  /** Adds a snapshot and enforces history capacity. */
  pushSnapshot(s: WorldSnapshot): void {
    this.latest = s;
    if (this.history.length >= this.maxHistorySize) {
      this.history.shift();
    }
    this.history.push(s);
  }

  /** Returns the most recently received snapshot. */
  getLatest(): WorldSnapshot | undefined {
    return this.latest;
  }

  /** Returns a copy of snapshot history in arrival order. */
  getHistory(): WorldSnapshot[] {
    return this.history.toArray();
  }
}
