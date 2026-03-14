import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer";
import { ClientWorld } from "@client/net/ClientWorld.ts";

/**
 * Stores the latest authoritative snapshot received from the server and
 * manages render-backed client entities through a PixiRenderer.
 */

export class ClientWorldState {
  pixiRenderer: PixiRenderer;
  public latestSnapshot?: WorldSnapshot;
  public latestSnapshotReceivedAt?: number;
  public previousSnapshot?: WorldSnapshot;
  public previousSnapshotReceivedAt?: number;
  
  public clientWorld?: ClientWorld;

  /**
   * Creates empty client-side world state.
   * Requires a PixiRenderer because client entities own both state and Pixi render objects.
   * window.PIXI must be available and initialized.
   */
  constructor(pixiRenderer: PixiRenderer) {
    if (!window.PIXI){
      throw new Error("PIXI is not available on the window object.");
    }
    this.pixiRenderer = pixiRenderer;
  }

  /**
   * Replaces the local present-state with a fresh authoritative snapshot.
   * @param snapshot Authoritative snapshot to apply.
   */
  pushSnapshot(snapshot: WorldSnapshot, receivedAt: number = performance.now()): void {
    this.previousSnapshot = this.latestSnapshot;
    this.previousSnapshotReceivedAt = this.latestSnapshotReceivedAt;
    this.latestSnapshot = snapshot;
    this.latestSnapshotReceivedAt = receivedAt;
    if (!this.clientWorld) {
      this.clientWorld = new ClientWorld(this.pixiRenderer, snapshot);
    } else {
      this.clientWorld.updateFromSnapshot(snapshot);
    }
  }

  public clear(): void {
    this.latestSnapshot = undefined;
    this.latestSnapshotReceivedAt = undefined;
    this.previousSnapshot = undefined;
    this.previousSnapshotReceivedAt = undefined;
    if (this.clientWorld) {
      this.clientWorld.destroy();
      this.clientWorld = undefined;
    }
  }
}
