import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer";
import { ClientWorld } from "@client/net/ClientWorld.ts";

/**
 * Stores the latest authoritative snapshot received from the server and
 * manages one render-backed client world plus interpolation timing metadata.
 */

export class ClientWorldState {
  pixiRenderer: PixiRenderer;
  public latestTick?: number;
  public latestSnapshotReceivedAt?: number;
  public previousSnapshotReceivedAt?: number;
  private readonly debugHitbox: boolean;
  private readonly debugInterpolation: boolean;

  public clientWorld?: ClientWorld;

  /**
   * Creates empty client-side world state.
   * Requires a PixiRenderer because client entities own both state and Pixi render objects.
   * @param pixiRenderer Renderer used by client entities created from snapshots.
   * @param debugHitbox Whether square hitbox overlays should be created for entities.
   * @param debugInterpolation Whether interpolation ghost overlays should be created.
   */
  constructor(
    pixiRenderer: PixiRenderer,
    debugHitbox: boolean,
    debugInterpolation: boolean,
  ) {
    this.pixiRenderer = pixiRenderer;
    this.debugHitbox = debugHitbox;
    this.debugInterpolation = debugInterpolation;
  }

  /**
   * Replaces the local present-state with a fresh authoritative snapshot.
   * @param snapshot Authoritative snapshot to apply.
   * @param receivedAt Monotonic receive timestamp used for interpolation timing.
   */
  pushSnapshot(
    snapshot: WorldSnapshot,
    receivedAt: number = performance.now(),
  ): void {
    this.previousSnapshotReceivedAt = this.latestSnapshotReceivedAt;
    this.latestTick = snapshot.tick;
    this.latestSnapshotReceivedAt = receivedAt;
    if (!this.clientWorld) {
      this.clientWorld = new ClientWorld(
        this.pixiRenderer,
        snapshot,
        this.debugHitbox,
        this.debugInterpolation,
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
