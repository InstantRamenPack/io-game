import { ClientWorld } from "@client/net/ClientWorld.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

const SNAPSHOT_HISTORY_LIMIT = 5;

export type SnapshotFrame = {
  tick: number;
  receivedAtMs: number;
};

/**
 * Stores the latest authoritative snapshot received from the server together
 * with the currently active client world and interpolation timing metadata.
 * A renderer is optional so the same type can be used both at runtime and in
 * headless tests.
 */
export class ClientWorldState {
  public latestTick?: number;
  public latestSnapshotReceivedAt?: number;
  public clientWorld?: ClientWorld;

  private readonly pixiRenderer?: PixiRenderer;
  private readonly debugHitbox: boolean;
  private readonly debugInterpolationMode: number;
  private readonly snapshotHistory: SnapshotFrame[] = [];

  constructor(
    pixiRenderer?: PixiRenderer,
    debugHitbox = false,
    debugInterpolationMode = 0,
  ) {
    this.pixiRenderer = pixiRenderer;
    this.debugHitbox = debugHitbox;
    this.debugInterpolationMode = debugInterpolationMode;
  }

  /**
   * Replaces the local present-state with a fresh authoritative snapshot.
   */
  public pushSnapshot(
    snapshot: WorldSnapshot,
    receivedAt: number = performance.now(),
  ): boolean {
    if (
      this.latestTick !== undefined &&
      snapshot.tick <= this.latestTick
    ) {
      return false;
    }

    this.latestTick = snapshot.tick;
    this.latestSnapshotReceivedAt = receivedAt;
    this.snapshotHistory.push({
      tick: snapshot.tick,
      receivedAtMs: receivedAt,
    });
    if (this.snapshotHistory.length > SNAPSHOT_HISTORY_LIMIT) {
      this.snapshotHistory.splice(
        0,
        this.snapshotHistory.length - SNAPSHOT_HISTORY_LIMIT,
      );
    }

    if (!this.clientWorld) {
      this.clientWorld = new ClientWorld(
        snapshot,
        snapshot.tick,
        this.pixiRenderer,
        this.debugHitbox,
        this.debugInterpolationMode,
      );
    } else {
      this.clientWorld.updateFromSnapshot(snapshot, snapshot.tick);
    }

    return true;
  }

  public getSnapshotHistory(): readonly SnapshotFrame[] {
    return this.snapshotHistory;
  }

  public clear(): void {
    this.latestTick = undefined;
    this.latestSnapshotReceivedAt = undefined;
    this.snapshotHistory.length = 0;
    if (this.clientWorld) {
      this.clientWorld.destroy();
      this.clientWorld = undefined;
    }
  }
}
