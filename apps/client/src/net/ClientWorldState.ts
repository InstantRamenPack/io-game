import type { WorldSnapshot } from "@shared/net/snapshots.ts";

/**
 * Stores the latest authoritative snapshot received from the server.
 */
export class ClientWorldState {
  latest?: WorldSnapshot;

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
  }
}
