import type { EntitySnapshot } from "@shared/net/snapshots.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer";
import type { EntityKind } from "@shared/ids/EntityKinds.ts";
import type { PixiContainer, PixiGraphics } from "@client/render/PixiTypes.ts";

/**
 * Client-side entity that owns both replicated attributes and its Pixi render objects.
 * Needs a PixiRenderer so it can attach graphics to the scene and keep the camera synced.
 */
export class ClientEntity {
  public readonly id: number;
  public readonly kind: EntityKind;

  /*
  IMPORTANT:
  These attributes are public for ease of access but should not be modified directly.
  Use update helpers so Pixi objects stay in sync with the replicated state.
  */
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public rotation: number;
  public radius: number;
  public hp?: number;
  public maxHp?: number;
  public ownerId?: number;

  private entityContainer: PixiContainer;
  private entityGraphic: PixiGraphics;
  private pixiRenderer: PixiRenderer;

  constructor(pixiRenderer: PixiRenderer, snapshot: EntitySnapshot) {
    this.id = snapshot.id;
    this.kind = snapshot.kind;
    this.x = snapshot.x;
    this.y = snapshot.y;
    this.vx = snapshot.vx;
    this.vy = snapshot.vy;
    this.rotation = snapshot.rotation;
    this.radius = snapshot.radius;
    this.hp = snapshot.hp;
    this.maxHp = snapshot.maxHp;
    this.ownerId = snapshot.ownerId;
    this.pixiRenderer = pixiRenderer;

    if (!window.PIXI) {
      throw new Error("PIXI is not available on the window object.");
    }

    this.entityContainer = new window.PIXI.Container();
    this.entityContainer.position.set(this.x, this.y);
    this.entityContainer.rotation = this.rotation;

    if (!this.pixiRenderer.entityContainer) {
      throw new Error("Pixi Renderer entity container not initialized.");
    }

    this.pixiRenderer.entityContainer.addChild(this.entityContainer);

    const graphics = new window.PIXI.Graphics();
    graphics.lineStyle(2, 0x000000, 1);
    if (this.kind === "player") {
      graphics.beginFill(0x00ff00, 1);
    } else if (this.kind === "enemy") {
      graphics.beginFill(0xbf2a2a, 1);
    } else {
      throw new Error(`Unknown entity kind: ${this.kind}`);
    }
    graphics.drawCircle(0, 0, this.radius);
    graphics.endFill();
    graphics.pivot.set(0, 0);

    this.entityGraphic = graphics;
    this.entityContainer.addChild(this.entityGraphic);
  }

  /**
   * Updates position and keeps the camera locked to the player entity when needed.
   */
  public updatePosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.entityContainer.position.set(this.x, this.y);

    if (this.pixiRenderer.playerEntityId === this.id) {
      this.pixiRenderer.setCameraToPlayer(this.x, this.y);
    }
  }

  /**
   * Updates this entity from a new snapshot.
   * Throws if the snapshot id does not match.
   */
  public updateFromSnapshot(snapshot: EntitySnapshot): void {
    if (snapshot.id !== this.id) {
      throw new Error(
        `Snapshot id (${snapshot.id}) does not match entity id (${this.id}).`,
      );
    }

    this.updatePosition(snapshot.x, snapshot.y);
    this.vx = snapshot.vx;
    this.vy = snapshot.vy;
    this.rotation = snapshot.rotation;
    this.hp = snapshot.hp;
    this.maxHp = snapshot.maxHp;
    this.ownerId = snapshot.ownerId;

    this.entityContainer.rotation = this.rotation;

    if (snapshot.radius !== this.radius) {
      this.radius = snapshot.radius;
      this.entityGraphic.clear();
      this.entityGraphic.lineStyle(2, 0x000000, 1);
      this.entityGraphic.beginFill(0x00ff00, 1);
      this.entityGraphic.drawCircle(0, 0, this.radius);
      this.entityGraphic.endFill();
    }
  }

  /**
   * Cleans up Pixi objects and removes this entity from the scene.
   */
  public destroy(): void {
    if (this.pixiRenderer.entityContainer && this.entityContainer.parent) {
      this.pixiRenderer.entityContainer.removeChild(this.entityContainer);
    }

    this.entityGraphic.destroy();
    this.entityContainer.destroy();
  }
}
