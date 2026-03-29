import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type {
  EntityRenderer,
  EntityRendererOptions,
} from "@client/render/entity/EntityRenderer.ts";
import * as PIXI from "pixijs";

export abstract class BaseEntityRenderer implements EntityRenderer {
  protected readonly entityContainer: PIXI.Container;
  protected readonly entityGraphic: PIXI.Graphics;
  protected readonly damageFlashGraphic: PIXI.Graphics;
  protected readonly healthBarContainer: PIXI.Container;
  protected readonly healthBarTrackGraphic: PIXI.Graphics;
  protected readonly healthBarFillGraphic: PIXI.Graphics;
  protected readonly hitboxContainer?: PIXI.Container;
  protected readonly hitboxGraphic?: PIXI.Graphics;
  protected readonly debugContainer?: PIXI.Container;
  protected readonly debugGraphic?: PIXI.Graphics;

  private damageFlashRemainingMs = 0;
  private damageFlashDurationMs = 150;
  private lastVisualVersion = -1;
  private lastHealthVersion = -1;

  public constructor(
    protected readonly pixiRenderer: PixiRenderer,
    {
      debugHitbox = false,
      debugInterpolationMode = 0,
    }: EntityRendererOptions = {},
  ) {
    if (!pixiRenderer.entityContainer) {
      throw new Error("Expected Pixi entity container to exist.");
    }

    this.entityContainer = new PIXI.Container();
    pixiRenderer.entityContainer.addChild(this.entityContainer);

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
      pixiRenderer.entityContainer.addChild(this.hitboxContainer);

      this.hitboxGraphic = new PIXI.Graphics();
      this.hitboxContainer.addChild(this.hitboxGraphic);
    }

    if (debugInterpolationMode > 0) {
      this.debugContainer = new PIXI.Container();
      pixiRenderer.entityContainer.addChild(this.debugContainer);

      this.debugGraphic = new PIXI.Graphics();
      this.debugContainer.addChild(this.debugGraphic);
    }
  }

  public sync(entity: ClientEntity): void {
    this.entityContainer.position.set(entity.x, entity.y);

    if (this.hitboxContainer) {
      this.hitboxContainer.position.set(entity.x, entity.y);
    }

    if (this.debugContainer) {
      this.debugContainer.position.set(entity.serverX, entity.serverY);
      this.debugContainer.rotation = entity.rotation;
    }

    if (this.pixiRenderer.playerEntityId === entity.id) {
      this.pixiRenderer.setCameraToPlayer(entity.x, entity.y);
    }

    const visualChanged = this.lastVisualVersion !== entity.visualVersion;
    if (visualChanged) {
      this.redrawPresentation(entity);
      this.lastVisualVersion = entity.visualVersion;
    }

    if (visualChanged || this.lastHealthVersion !== entity.healthVersion) {
      this.redrawHealthBar(entity);
      this.lastHealthVersion = entity.healthVersion;
    }
  }

  public update(deltaMs: number, _entity: ClientEntity): void {
    this.damageFlashRemainingMs = Math.max(
      0,
      this.damageFlashRemainingMs - deltaMs,
    );
    this.syncDamageFlashVisual();
  }

  public triggerDamageFlash(durationMs = 150): void {
    this.damageFlashDurationMs = Math.max(1, durationMs);
    this.damageFlashRemainingMs = this.damageFlashDurationMs;
    this.syncDamageFlashVisual();
  }

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

  protected abstract drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha?: number,
  ): void;

  protected abstract getFillColor(entity: ClientEntity): number;

  protected getVisualRadius(entity: ClientEntity): number {
    return Math.max(entity.hitboxBounds.width, entity.hitboxBounds.height) / 2;
  }

  private redrawPresentation(entity: ClientEntity): void {
    const fillColor = this.getFillColor(entity);

    this.drawEntityShape(this.entityGraphic, entity, fillColor, 1, 1);
    this.drawEntityShape(this.damageFlashGraphic, entity, 0xff4242, 1, 1);

    if (this.hitboxGraphic) {
      this.hitboxGraphic.clear();
      this.hitboxGraphic.lineStyle(2, 0x2d68ff, 0.8);
      for (const hitbox of entity.hitboxes) {
        this.hitboxGraphic.drawRect(
          hitbox.offsetX - hitbox.width / 2,
          hitbox.offsetY - hitbox.height / 2,
          hitbox.width,
          hitbox.height,
        );
      }
    }

    if (this.debugGraphic) {
      this.drawEntityShape(this.debugGraphic, entity, fillColor, 0.2, 0.35);
    }
  }

  private redrawHealthBar(entity: ClientEntity): void {
    const canShow = entity.maxHp > 0;
    this.healthBarContainer.visible = canShow;
    if (!canShow) {
      return;
    }

    const width = Math.max(20, entity.hitboxBounds.width);
    const height = 5;
    const ratio = Math.max(0, Math.min(1, entity.hp / Math.max(1, entity.maxHp)));
    const left = entity.hitboxBounds.centerX - width / 2;
    const top = entity.hitboxBounds.minY - 12;

    this.healthBarTrackGraphic.clear();
    this.healthBarTrackGraphic.beginFill(0x1b1b1b, 0.85);
    this.healthBarTrackGraphic.drawRoundedRect(left, top, width, height, 3);
    this.healthBarTrackGraphic.endFill();

    this.healthBarFillGraphic.clear();
    this.healthBarFillGraphic.beginFill(0x57d34d, 0.95);
    this.healthBarFillGraphic.drawRoundedRect(left, top, width * ratio, height, 3);
    this.healthBarFillGraphic.endFill();
  }

  private syncDamageFlashVisual(): void {
    const alpha =
      this.damageFlashDurationMs <= 0
        ? 0
        : (this.damageFlashRemainingMs / this.damageFlashDurationMs) * 0.7;
    this.damageFlashGraphic.alpha = alpha;
    this.damageFlashGraphic.visible = alpha > 0.001;
  }
}
