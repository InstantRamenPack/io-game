import { ClientWorld } from "@client/net/ClientWorld.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

/**
 * Stores the latest authoritative snapshot received from the server together
 * with the currently active client world and interpolation timing metadata.
 * A renderer is optional so the same type can be used both at runtime and in
 * headless tests.
 */
export class ClientWorldState {
  public latestTick?: number;
  public latestSnapshotReceivedAt?: number;
  public previousSnapshotReceivedAt?: number;
  public clientWorld?: ClientWorld;

  private readonly pixiRenderer?: PixiRenderer;
  private readonly debugHitbox: boolean;
  private readonly debugInterpolationMode: number;

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
  ): void {
    this.previousSnapshotReceivedAt = this.latestSnapshotReceivedAt;
    this.latestTick = snapshot.tick;
    this.latestSnapshotReceivedAt = receivedAt;

    if (!this.clientWorld) {
      this.clientWorld = new ClientWorld(
        snapshot,
        this.pixiRenderer,
        this.debugHitbox,
        this.debugInterpolationMode,
      );
    } else {
      this.clientWorld.updateFromSnapshot(snapshot);
    }
  }

  public clear(): void {
    this.latestTick = undefined;
    this.latestSnapshotReceivedAt = undefined;
    this.previousSnapshotReceivedAt = undefined;
    if (this.clientWorld) {
      this.clientWorld.destroy();
      this.clientWorld = undefined;
    }
  }
}
