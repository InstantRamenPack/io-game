import type {
  EntitySnapshot,
  ItemStackSnapshot,
} from "@shared/net/snapshots.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer";
import {
  getResourceNamespace,
  type ResourceId,
} from "@shared/ids/ResourceId.ts";
import { ClientItemStack } from "@client/net/ClientItemStack.ts";
import * as PIXI from "pixijs";

/**
 * Client-side entity that owns both replicated attributes and its Pixi render objects.
 * Needs a PixiRenderer so it can attach graphics to the scene and keep the camera synced.
 */
export class ClientEntity {
  public readonly id: number;
  public readonly typeId: ResourceId;

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
  public data?: Record<string, unknown>;
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
  private damageFlashGraphic: PIXI.Graphics;
  private healthBarContainer: PIXI.Container;
  private healthBarTrackGraphic: PIXI.Graphics;
  private healthBarFillGraphic: PIXI.Graphics;
  private hitboxContainer?: PIXI.Container;
  private hitboxGraphic?: PIXI.Graphics;
  private debugContainer?: PIXI.Container;
  private debugGraphic?: PIXI.Graphics;
  private pixiRenderer: PixiRenderer;
  private damageFlashRemainingMs = 0;
  private damageFlashDurationMs = 150;

  constructor(
    pixiRenderer: PixiRenderer,
    snapshot: EntitySnapshot,
    debugHitbox: boolean,
    debugInterpolationMode: number,
  ) {
    this.id = snapshot.id;
    this.typeId = snapshot.typeId;
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
    this.data = snapshot.data;
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
    this.drawEntityShape(graphics, this.fillColorForKind(), 1);
    graphics.pivot.set(0, 0);

    this.entityGraphic = graphics;
    this.entityContainer.addChild(this.entityGraphic);
    this.entityGraphic.visible = debugInterpolationMode !== 2;

    this.damageFlashGraphic = new PIXI.Graphics();
    this.drawEntityShape(this.damageFlashGraphic, 0xff4242, 1);
    this.damageFlashGraphic.alpha = 0;
    this.damageFlashGraphic.visible = false;
    this.entityContainer.addChild(this.damageFlashGraphic);

    this.healthBarContainer = new PIXI.Container();
    this.healthBarTrackGraphic = new PIXI.Graphics();
    this.healthBarFillGraphic = new PIXI.Graphics();
    this.healthBarContainer.addChild(this.healthBarTrackGraphic);
    this.healthBarContainer.addChild(this.healthBarFillGraphic);
    this.entityContainer.addChild(this.healthBarContainer);
    this.redrawHealthBar();

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

    if (debugInterpolationMode > 0) {
      this.debugContainer = new PIXI.Container();
      this.debugContainer.position.set(this.serverX, this.serverY);
      this.debugContainer.rotation = this.rotation;
      this.pixiRenderer.entityContainer.addChild(this.debugContainer);

      const debugGraphics = new PIXI.Graphics();
      this.drawEntityShape(debugGraphics, this.fillColorForKind(), 0.2, 0.35);
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
    if (snapshot.typeId !== this.typeId) {
      throw new Error(
        `Snapshot typeId (${snapshot.typeId}) does not match entity typeId (${this.typeId}).`,
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
    this.data = snapshot.data;
    this.inventory = this.mapInventory(snapshot.inventory);
    this.activeSlot = snapshot.activeSlot;

    this.entityContainer.rotation = this.rotation;
    if (this.debugContainer) {
      this.debugContainer.position.set(this.serverX, this.serverY);
      this.debugContainer.rotation = this.rotation;
    }

    if (snapshot.radius !== this.radius) {
      this.radius = snapshot.radius;
      this.drawEntityShape(this.entityGraphic, this.fillColorForKind(), 1);
      this.drawEntityShape(this.damageFlashGraphic, 0xff4242, 1);

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
        this.drawEntityShape(
          this.debugGraphic,
          this.fillColorForKind(),
          0.2,
          0.35,
        );
      }
    }

    this.redrawHealthBar();
  }

  /**
   * Advances short-lived presentation-only effects like hit flashes.
   * @param deltaMs Frame delta in milliseconds.
   */
  public update(deltaMs: number): void {
    this.damageFlashRemainingMs = Math.max(
      0,
      this.damageFlashRemainingMs - deltaMs,
    );
    const alpha =
      this.damageFlashDurationMs <= 0
        ? 0
        : (this.damageFlashRemainingMs / this.damageFlashDurationMs) * 0.7;
    this.damageFlashGraphic.alpha = alpha;
    this.damageFlashGraphic.visible = alpha > 0.001;
  }

  /**
   * Triggers a red flash on top of the entity for one short hit-confirm window.
   * @param durationMs Flash duration in milliseconds.
   */
  public triggerDamageFlash(durationMs = 150): void {
    this.damageFlashDurationMs = Math.max(1, durationMs);
    this.damageFlashRemainingMs = this.damageFlashDurationMs;
    this.update(0);
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
    this.damageFlashGraphic.destroy();
    this.healthBarTrackGraphic.destroy();
    this.healthBarFillGraphic.destroy();
    this.healthBarContainer.destroy();
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

  private drawEntityShape(
    graphics: PIXI.Graphics,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    graphics.lineStyle(2, 0x000000, lineAlpha);
    graphics.beginFill(fillColor, alpha);
    graphics.drawCircle(0, 0, this.radius);
    graphics.endFill();
  }

  private redrawHealthBar(): void {
    const canShow =
      this.hp !== undefined && this.maxHp !== undefined && this.maxHp > 0;
    this.healthBarContainer.visible = canShow;
    if (!canShow) {
      return;
    }

    const width = Math.max(20, this.radius * 2);
    const height = 5;
    const ratio = Math.max(0, Math.min(1, (this.hp ?? 0) / (this.maxHp ?? 1)));
    const left = -width / 2;
    const top = -this.radius - 12;

    this.healthBarTrackGraphic.clear();
    this.healthBarTrackGraphic.beginFill(0x1b1b1b, 0.85);
    this.healthBarTrackGraphic.drawRoundedRect(left, top, width, height, 3);
    this.healthBarTrackGraphic.endFill();

    this.healthBarFillGraphic.clear();
    this.healthBarFillGraphic.beginFill(0x57d34d, 0.95);
    this.healthBarFillGraphic.drawRoundedRect(
      left,
      top,
      width * ratio,
      height,
      3,
    );
    this.healthBarFillGraphic.endFill();
  }

  private fillColorForKind(): number {
    if (this.hasTypeNamespace("player")) {
      return 0x00ff00;
    }
    if (this.hasTypeNamespace("enemy")) {
      return 0xbf2a2a;
    }
    if (this.hasTypeNamespace("projectile")) {
      return 0xffb703;
    }
    return 0xd6e5d2;
  }

  private hasTypeNamespace(namespace: string): boolean {
    return getResourceNamespace(this.typeId) === namespace;
  }
}
