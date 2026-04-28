import { ClientWorld } from "@client/net/ClientWorld.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

type SnapshotFrame = {
  tick: number;
  receivedAtMs: number;
};

export type SnapshotPushResult =
  | { applied: true }
  | { applied: false; reason: "duplicate" | "out_of_order" };

export type SnapshotReceiveStats = {
  duplicateSnapshotCount: number;
  outOfOrderSnapshotCount: number;
  latestArrivalIntervalMs: number | null;
};

/**
 * Stores the latest authoritative snapshot received from the server together
 * with the currently active client world and interpolation timing metadata.
 */
export class ClientWorldState {
  public latestTick?: number;
  public latestSnapshotReceivedAt?: number;
  public clientWorld?: ClientWorld;

  private readonly snapshotHistoryLimit: number;
  private readonly snapshotHistory: SnapshotFrame[] = [];
  private duplicateSnapshotCount = 0;
  private outOfOrderSnapshotCount = 0;
  private latestArrivalIntervalMs: number | null = null;

  constructor(snapshotHistoryLimit = 2) {
    this.snapshotHistoryLimit = Math.max(2, Math.floor(snapshotHistoryLimit));
  }

  /**
   * Replaces the local present-state with a fresh authoritative snapshot.
   */
  public pushSnapshot(
    snapshot: WorldSnapshot,
    receivedAt: number = performance.now(),
  ): SnapshotPushResult {
    if (this.latestTick !== undefined && snapshot.tick <= this.latestTick) {
      if (snapshot.tick === this.latestTick) {
        this.duplicateSnapshotCount += 1;
        return { applied: false, reason: "duplicate" };
      }
      this.outOfOrderSnapshotCount += 1;
      return { applied: false, reason: "out_of_order" };
    }

    if (this.latestSnapshotReceivedAt !== undefined) {
      this.latestArrivalIntervalMs = receivedAt - this.latestSnapshotReceivedAt;
    }
    this.latestTick = snapshot.tick;
    this.latestSnapshotReceivedAt = receivedAt;
    this.snapshotHistory.push({
      tick: snapshot.tick,
      receivedAtMs: receivedAt,
    });
    if (this.snapshotHistory.length > this.snapshotHistoryLimit) {
      this.snapshotHistory.splice(
        0,
        this.snapshotHistory.length - this.snapshotHistoryLimit,
      );
    }

    if (!this.clientWorld) {
      this.clientWorld = new ClientWorld(
        snapshot,
        snapshot.tick,
        this.snapshotHistoryLimit,
      );
    } else {
      this.clientWorld.updateFromSnapshot(snapshot, snapshot.tick);
    }

    return { applied: true };
  }

  public getSnapshotHistory(): readonly SnapshotFrame[] {
    return this.snapshotHistory;
  }

  public getSnapshotReceiveStats(): SnapshotReceiveStats {
    return {
      duplicateSnapshotCount: this.duplicateSnapshotCount,
      outOfOrderSnapshotCount: this.outOfOrderSnapshotCount,
      latestArrivalIntervalMs: this.latestArrivalIntervalMs,
    };
  }

  public clear(): void {
    this.latestTick = undefined;
    this.latestSnapshotReceivedAt = undefined;
    this.duplicateSnapshotCount = 0;
    this.outOfOrderSnapshotCount = 0;
    this.latestArrivalIntervalMs = null;
    this.snapshotHistory.length = 0;
    if (this.clientWorld) {
      this.clientWorld.destroy();
      this.clientWorld = undefined;
    }
  }
}
