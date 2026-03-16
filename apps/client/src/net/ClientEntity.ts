import type {
  EntitySnapshot,
  ItemStackSnapshot,
} from "@shared/net/snapshots.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer";
import type { EntityKind } from "@shared/ids/EntityKinds.ts";
import { ClientItemStack } from "@client/net/ClientItemStack.ts";
import * as PIXI from "pixijs";

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

  /*
  Stores the current x,y coords to be rendererd on the screen
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
  public inventory?: Array<ClientItemStack | null>;
  public activeSlot?: number;

  /*
  Stores the "true" x,y coords given by the server through snapshots. Used for interpolation and reconciliation. Should not be modified directly, only through snapshot updates.
  */
  public serverX: number;
  public serverY: number;
  public prevServerX: number;
  public prevServerY: number;

  private entityContainer: PIXI.Container;
  private entityGraphic: PIXI.Graphics;
  private hitboxContainer?: PIXI.Container;
  private hitboxGraphic?: PIXI.Graphics;
  private debugContainer?: PIXI.Container;
  private debugGraphic?: PIXI.Graphics;
  private pixiRenderer: PixiRenderer;

  constructor(
    pixiRenderer: PixiRenderer,
    snapshot: EntitySnapshot,
    debugHitbox: boolean,
    debugInterpolation: boolean,
  ) {
    this.id = snapshot.id;
    this.kind = snapshot.kind;
    this.x = snapshot.x;
    this.y = snapshot.y;
    this.vx = snapshot.vx;
    this.vy = snapshot.vy;
    this.serverX = snapshot.x;
    this.serverY = snapshot.y;
    this.prevServerX = snapshot.x;
    this.prevServerY = snapshot.y;

    this.rotation = snapshot.rotation;
    this.radius = snapshot.radius;
    this.hp = snapshot.hp;
    this.maxHp = snapshot.maxHp;
    this.ownerId = snapshot.ownerId;
    this.inventory = this.mapInventory(snapshot.inventory);
    this.activeSlot = snapshot.activeSlot;
    this.pixiRenderer = pixiRenderer;

    this.entityContainer = new PIXI.Container();
    this.entityContainer.position.set(this.x, this.y);
    this.entityContainer.rotation = this.rotation;

    if (!this.pixiRenderer.entityContainer) {
      throw new Error("Pixi Renderer entity container not initialized.");
    }

    this.pixiRenderer.entityContainer.addChild(this.entityContainer);

    const graphics = new PIXI.Graphics();
    graphics.lineStyle(2, 0x000000, 1);
    graphics.beginFill(this.fillColorForKind(1), 1);
    graphics.drawCircle(0, 0, this.radius);
    graphics.endFill();
    graphics.pivot.set(0, 0);

    this.entityGraphic = graphics;
    this.entityContainer.addChild(this.entityGraphic);

    if (debugHitbox) {
      this.hitboxContainer = new PIXI.Container();
      this.hitboxContainer.position.set(this.x, this.y);
      this.pixiRenderer.entityContainer.addChild(this.hitboxContainer);

      const hitboxGraphics = new PIXI.Graphics();
      hitboxGraphics.lineStyle(2, 0x2d68ff, 0.8);
      hitboxGraphics.drawRect(
        -this.radius,
        -this.radius,
        this.radius * 2,
        this.radius * 2,
      );

      this.hitboxGraphic = hitboxGraphics;
      this.hitboxContainer.addChild(this.hitboxGraphic);
    }

    if (debugInterpolation) {
      this.debugContainer = new PIXI.Container();
      this.debugContainer.position.set(this.serverX, this.serverY);
      this.debugContainer.rotation = this.rotation;
      this.pixiRenderer.entityContainer.addChild(this.debugContainer);

      const debugGraphics = new PIXI.Graphics();
      debugGraphics.lineStyle(2, 0x000000, 0.35);
      debugGraphics.beginFill(this.fillColorForKind(0.2), 0.2);
      debugGraphics.drawCircle(0, 0, this.radius);
      debugGraphics.endFill();
      debugGraphics.pivot.set(0, 0);

      this.debugGraphic = debugGraphics;
      this.debugContainer.addChild(this.debugGraphic);
    }
  }

  /**
   * Updates position and keeps the camera locked to the player entity when needed.
   */
  public updatePosition(x: number, y: number): void {
    //DOESNT UPDATE SERVER POSITION, ONLY CLIENT POSITION. SERVER POSITION SHOULD BE UPDATED THROUGH SNAPSHOT UPDATES
    this.x = x;
    this.y = y;
    this.entityContainer.position.set(this.x, this.y);
    this.hitboxContainer?.position.set(this.x, this.y);

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

    this.prevServerX = this.serverX;
    this.prevServerY = this.serverY;
    this.serverX = snapshot.x;
    this.serverY = snapshot.y;
    this.vx = snapshot.vx;
    this.vy = snapshot.vy;
    this.rotation = snapshot.rotation;
    this.hp = snapshot.hp;
    this.maxHp = snapshot.maxHp;
    this.ownerId = snapshot.ownerId;
    this.inventory = this.mapInventory(snapshot.inventory);
    this.activeSlot = snapshot.activeSlot;

    this.entityContainer.rotation = this.rotation;
    if (this.debugContainer) {
      this.debugContainer.position.set(this.serverX, this.serverY);
      this.debugContainer.rotation = this.rotation;
    }

    if (snapshot.radius !== this.radius) {
      this.radius = snapshot.radius;
      this.entityGraphic.clear();
      this.entityGraphic.lineStyle(2, 0x000000, 1);
      this.entityGraphic.beginFill(this.fillColorForKind(1), 1);
      this.entityGraphic.drawCircle(0, 0, this.radius);
      this.entityGraphic.endFill();

      if (this.hitboxGraphic) {
        this.hitboxGraphic.clear();
        this.hitboxGraphic.lineStyle(2, 0x2d68ff, 0.8);
        this.hitboxGraphic.drawRect(
          -this.radius,
          -this.radius,
          this.radius * 2,
          this.radius * 2,
        );
      }

      if (this.debugGraphic) {
        this.debugGraphic.clear();
        this.debugGraphic.lineStyle(2, 0x000000, 0.35);
        this.debugGraphic.beginFill(this.fillColorForKind(0.2), 0.2);
        this.debugGraphic.drawCircle(0, 0, this.radius);
        this.debugGraphic.endFill();
      }
    }
  }

  /**
   * Cleans up Pixi objects and removes this entity from the scene.
   */
  public destroy(): void {
    if (this.pixiRenderer.entityContainer && this.entityContainer.parent) {
      this.pixiRenderer.entityContainer.removeChild(this.entityContainer);
    }
    if (this.pixiRenderer.entityContainer && this.hitboxContainer?.parent) {
      this.pixiRenderer.entityContainer.removeChild(this.hitboxContainer);
    }
    if (this.pixiRenderer.entityContainer && this.debugContainer?.parent) {
      this.pixiRenderer.entityContainer.removeChild(this.debugContainer);
    }

    this.entityGraphic.destroy();
    this.entityContainer.destroy();
    this.hitboxGraphic?.destroy();
    this.hitboxContainer?.destroy();
    this.debugGraphic?.destroy();
    this.debugContainer?.destroy();
  }

  private mapInventory(
    inventory: Array<ItemStackSnapshot | null> | undefined,
  ): Array<ClientItemStack | null> | undefined {
    if (!inventory) {
      return undefined;
    }
    return inventory.map((item) => (item ? new ClientItemStack(item) : null));
  }

  private fillColorForKind(_alpha: number): number {
    if (this.kind === "player") {
      return 0x00ff00;
    }
    if (this.kind === "enemy") {
      return 0xbf2a2a;
    }
    throw new Error(`Unknown entity kind: ${this.kind}`);
  }
}
