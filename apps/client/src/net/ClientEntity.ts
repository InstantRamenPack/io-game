import { ClientItemStack } from "@client/net/ClientItemStack.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type { EntityKind } from "@shared/content/types.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type {
  EntitySnapshot,
  ItemStackSnapshot,
} from "@shared/net/snapshots.ts";
import * as PIXI from "pixijs";

type ClientEntityRenderOptions = {
  pixiRenderer?: PixiRenderer;
  debugHitbox?: boolean;
  debugInterpolationMode?: number;
};

/**
 * Client-side entity that stores replicated state and, when a renderer is
 * available, also owns its Pixi presentation objects. This restores the older
 * net-layer responsibility split while remaining compatible with the current
 * typed snapshot shapes and headless tests.
 */
export class ClientEntity {
  public readonly id: number;
  public readonly kind: EntityKind;
  public readonly typeId: ResourceId;
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public rotation: number;
  public radius: number;
  public hp?: number;
  public maxHp?: number;
  public ownerId?: number;
  public name?: string;
  public label?: string;
  public tier?: number;
  public inventory?: Array<ClientItemStack | null>;
  public activeSlot?: number;
  public activeEffects?: string[];
  public moveSpeed?: number;
  public targetId?: number;
  public serverX: number;
  public serverY: number;
  public prevServerX: number;
  public prevServerY: number;

  private readonly pixiRenderer?: PixiRenderer;
  private entityContainer?: PIXI.Container;
  private entityGraphic?: PIXI.Graphics;
  private damageFlashGraphic?: PIXI.Graphics;
  private healthBarContainer?: PIXI.Container;
  private healthBarTrackGraphic?: PIXI.Graphics;
  private healthBarFillGraphic?: PIXI.Graphics;
  private hitboxContainer?: PIXI.Container;
  private hitboxGraphic?: PIXI.Graphics;
  private debugContainer?: PIXI.Container;
  private debugGraphic?: PIXI.Graphics;
  private damageFlashRemainingMs = 0;
  private damageFlashDurationMs = 150;

  public constructor(
    snapshot: EntitySnapshot,
    options: ClientEntityRenderOptions = {},
  ) {
    this.id = snapshot.id;
    this.kind = snapshot.kind;
    this.typeId = snapshot.typeId;
    this.x = snapshot.x;
    this.y = snapshot.y;
    this.vx = snapshot.vx;
    this.vy = snapshot.vy;
    this.rotation = snapshot.rotation;
    this.radius = snapshot.radius;
    this.hp = snapshot.hp;
    this.maxHp = snapshot.maxHp;
    this.ownerId = snapshot.ownerId;
    this.serverX = snapshot.x;
    this.serverY = snapshot.y;
    this.prevServerX = snapshot.x;
    this.prevServerY = snapshot.y;
    this.pixiRenderer = options.pixiRenderer;

    this.applyKindSpecificFields(snapshot);

    if (this.pixiRenderer?.entityContainer) {
      this.initializePixiPresentation(
        options.debugHitbox ?? false,
        options.debugInterpolationMode ?? 0,
      );
    }
  }

  /**
   * Updates the rendered position and keeps the camera centered on the local
   * player when this entity is the controlled avatar.
   */
  public updatePosition(x: number, y: number): void {
    this.x = x;
    this.y = y;

    this.entityContainer?.position.set(this.x, this.y);
    this.hitboxContainer?.position.set(this.x, this.y);

    if (this.pixiRenderer?.playerEntityId === this.id) {
      this.pixiRenderer.setCameraToPlayer(this.x, this.y);
    }
  }

  /**
   * Applies the newest authoritative snapshot for this entity and refreshes
   * Pixi presentation objects when they are present.
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
    if (snapshot.kind !== this.kind) {
      throw new Error(
        `Snapshot kind (${snapshot.kind}) does not match entity kind (${this.kind}).`,
      );
    }

    this.prevServerX = this.serverX;
    this.prevServerY = this.serverY;
    this.serverX = snapshot.x;
    this.serverY = snapshot.y;
    this.vx = snapshot.vx;
    this.vy = snapshot.vy;
    this.rotation = snapshot.rotation;
    this.radius = snapshot.radius;
    this.hp = snapshot.hp;
    this.maxHp = snapshot.maxHp;
    this.ownerId = snapshot.ownerId;

    this.applyKindSpecificFields(snapshot);

    if (this.entityContainer) {
      this.entityContainer.rotation = this.rotation;
    }
    if (this.debugContainer) {
      this.debugContainer.position.set(this.serverX, this.serverY);
      this.debugContainer.rotation = this.rotation;
    }

    this.redrawPresentation();
    this.redrawHealthBar();
  }

  /**
   * Advances short-lived Pixi-only presentation effects such as hit flashes.
   * When the entity is running headlessly with no Pixi presentation, this is a
   * cheap no-op.
   */
  public update(deltaMs: number): void {
    if (!this.damageFlashGraphic) {
      return;
    }

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
   * Triggers the entity-local damage flash effect when Pixi graphics exist.
   * Headless entities ignore this call safely.
   */
  public triggerDamageFlash(durationMs = 150): void {
    if (!this.damageFlashGraphic) {
      return;
    }

    this.damageFlashDurationMs = Math.max(1, durationMs);
    this.damageFlashRemainingMs = this.damageFlashDurationMs;
    this.update(0);
  }

  /**
   * Removes the Pixi scene objects owned by this entity and clears any
   * presentation-only resources. Pure data fields remain accessible until the
   * entity is discarded by the owning world.
   */
  public destroy(): void {
    if (this.pixiRenderer?.entityContainer && this.entityContainer?.parent) {
      this.pixiRenderer.entityContainer.removeChild(this.entityContainer);
    }
    if (this.pixiRenderer?.entityContainer && this.hitboxContainer?.parent) {
      this.pixiRenderer.entityContainer.removeChild(this.hitboxContainer);
    }
    if (this.pixiRenderer?.entityContainer && this.debugContainer?.parent) {
      this.pixiRenderer.entityContainer.removeChild(this.debugContainer);
    }

    this.entityGraphic?.destroy();
    this.damageFlashGraphic?.destroy();
    this.healthBarTrackGraphic?.destroy();
    this.healthBarFillGraphic?.destroy();
    this.healthBarContainer?.destroy();
    this.entityContainer?.destroy();
    this.hitboxGraphic?.destroy();
    this.hitboxContainer?.destroy();
    this.debugGraphic?.destroy();
    this.debugContainer?.destroy();

    this.entityGraphic = undefined;
    this.damageFlashGraphic = undefined;
    this.healthBarTrackGraphic = undefined;
    this.healthBarFillGraphic = undefined;
    this.healthBarContainer = undefined;
    this.entityContainer = undefined;
    this.hitboxGraphic = undefined;
    this.hitboxContainer = undefined;
    this.debugGraphic = undefined;
    this.debugContainer = undefined;
  }

  private initializePixiPresentation(
    debugHitbox: boolean,
    debugInterpolationMode: number,
  ): void {
    if (!this.pixiRenderer?.entityContainer) {
      return;
    }

    this.entityContainer = new PIXI.Container();
    this.entityContainer.position.set(this.x, this.y);
    this.entityContainer.rotation = this.rotation;
    this.pixiRenderer.entityContainer.addChild(this.entityContainer);

    this.entityGraphic = new PIXI.Graphics();
    this.entityGraphic.visible = debugInterpolationMode !== 2;
    this.entityContainer.addChild(this.entityGraphic);

    this.damageFlashGraphic = new PIXI.Graphics();
    this.damageFlashGraphic.alpha = 0;
    this.damageFlashGraphic.visible = false;
    this.entityContainer.addChild(this.damageFlashGraphic);

    this.healthBarContainer = new PIXI.Container();
    this.healthBarTrackGraphic = new PIXI.Graphics();
    this.healthBarFillGraphic = new PIXI.Graphics();
    this.healthBarContainer.addChild(this.healthBarTrackGraphic);
    this.healthBarContainer.addChild(this.healthBarFillGraphic);
    this.entityContainer.addChild(this.healthBarContainer);

    if (debugHitbox) {
      this.hitboxContainer = new PIXI.Container();
      this.hitboxContainer.position.set(this.x, this.y);
      this.pixiRenderer.entityContainer.addChild(this.hitboxContainer);

      this.hitboxGraphic = new PIXI.Graphics();
      this.hitboxContainer.addChild(this.hitboxGraphic);
    }

    if (debugInterpolationMode > 0) {
      this.debugContainer = new PIXI.Container();
      this.debugContainer.position.set(this.serverX, this.serverY);
      this.debugContainer.rotation = this.rotation;
      this.pixiRenderer.entityContainer.addChild(this.debugContainer);

      this.debugGraphic = new PIXI.Graphics();
      this.debugContainer.addChild(this.debugGraphic);
    }

    this.redrawPresentation();
    this.redrawHealthBar();
  }

  private applyKindSpecificFields(snapshot: EntitySnapshot): void {
    this.name = undefined;
    this.label = undefined;
    this.tier = undefined;
    this.inventory = undefined;
    this.activeSlot = undefined;
    this.activeEffects = undefined;
    this.moveSpeed = undefined;
    this.targetId = undefined;

    switch (snapshot.kind) {
      case "player":
        this.name = snapshot.name;
        this.inventory = this.mapInventory(snapshot.inventory);
        this.activeSlot = snapshot.activeSlot;
        this.activeEffects = [...snapshot.activeEffects];
        this.moveSpeed = snapshot.moveSpeed;
        break;
      case "enemy":
        this.targetId = snapshot.targetId;
        break;
      case "building":
        this.label = snapshot.label;
        this.tier = snapshot.tier;
        break;
      case "pickup":
        this.inventory = this.mapInventory(snapshot.inventory);
        break;
      case "projectile":
        break;
    }
  }

  private mapInventory(
    inventory: Array<ItemStackSnapshot | null> | undefined,
  ): Array<ClientItemStack | null> | undefined {
    if (!inventory) {
      return undefined;
    }

    return inventory.map((item) => (item ? new ClientItemStack(item) : null));
  }

  private redrawPresentation(): void {
    if (!this.entityGraphic || !this.damageFlashGraphic) {
      return;
    }

    this.drawEntityShape(this.entityGraphic, this.fillColorForType(), 1);
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
      this.drawEntityShape(this.debugGraphic, this.fillColorForType(), 0.2, 0.35);
    }
  }

  private drawEntityShape(
    graphics: PIXI.Graphics,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    graphics.lineStyle(2, 0x000000, lineAlpha);

    if (this.kind === "building") {
      this.drawBuildingShape(graphics, fillColor, alpha, lineAlpha);
      return;
    }

    graphics.beginFill(fillColor, alpha);
    graphics.drawCircle(0, 0, this.radius);
    graphics.endFill();
  }

  private drawBuildingShape(
    graphics: PIXI.Graphics,
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    const typePath = this.getTypePath();

    graphics.beginFill(fillColor, alpha);
    if (typePath === "wall") {
      graphics.drawRoundedRect(
        -this.radius,
        -this.radius * 0.6,
        this.radius * 2,
        this.radius * 1.2,
        4,
      );
    } else if (typePath === "tower") {
      graphics.drawRect(
        -this.radius * 0.75,
        -this.radius * 0.85,
        this.radius * 1.5,
        this.radius * 1.7,
      );
    } else if (typePath === "windmill") {
      graphics.drawCircle(0, 0, this.radius * 0.72);
    } else {
      graphics.drawRoundedRect(
        -this.radius,
        -this.radius * 0.8,
        this.radius * 2,
        this.radius * 1.6,
        6,
      );
    }
    graphics.endFill();

    if (typePath === "windmill") {
      graphics.lineStyle(2, 0xffffff, lineAlpha);
      graphics.moveTo(-this.radius * 1.05, 0);
      graphics.lineTo(this.radius * 1.05, 0);
      graphics.moveTo(0, -this.radius * 1.05);
      graphics.lineTo(0, this.radius * 1.05);
    }
  }

  private redrawHealthBar(): void {
    if (
      !this.healthBarContainer ||
      !this.healthBarTrackGraphic ||
      !this.healthBarFillGraphic
    ) {
      return;
    }

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
    this.healthBarFillGraphic.drawRoundedRect(left, top, width * ratio, height, 3);
    this.healthBarFillGraphic.endFill();
  }

  private fillColorForType(): number {
    if (this.kind === "player") {
      return 0x67d944;
    }
    if (this.kind === "enemy") {
      return 0xbf2a2a;
    }
    if (this.kind === "projectile") {
      return 0xffb703;
    }
    if (this.kind === "building") {
      return this.buildingColor();
    }
    return 0xd6e5d2;
  }

  private buildingColor(): number {
    const typePath = this.getTypePath();
    if (typePath === "wall") {
      return 0x8b6f57;
    }
    if (typePath === "tower") {
      return 0xc78d2d;
    }
    if (typePath === "windmill") {
      return 0x6fb676;
    }
    if (typePath === "crafting_station") {
      return 0x4b77b9;
    }
    return 0xd6e5d2;
  }

  private getTypePath(): string {
    const [, path = this.typeId] = this.typeId.split(":");
    return path;
  }
}
