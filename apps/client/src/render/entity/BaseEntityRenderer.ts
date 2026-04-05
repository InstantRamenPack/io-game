import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type {
  EquippedRenderContext,
  EquippedItemRenderer,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { resolveEquippedItemRenderer } from "@client/render/entity/equipped/EquippedItemRendererRegistry.ts";
import type {
  EntityRenderer,
  EntityRendererOptions,
} from "@client/render/entity/EntityRenderer.ts";
import { getItemContent, getWeaponContent } from "@shared/content/catalog.ts";
import type { WeaponContent } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import * as PIXI from "pixijs";

export abstract class BaseEntityRenderer implements EntityRenderer {
  protected readonly entityContainer: PIXI.Container;
  protected readonly entityGraphic: PIXI.Graphics;
  protected readonly equippedItemContainer: PIXI.Container;
  protected readonly equippedItemSprite: PIXI.Sprite;
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
  private attackAnimationRemainingMs = 0;
  private attackAnimationDurationMs = 0;
  private lastVisualVersion = -1;
  private lastHealthVersion = -1;
  private lastAttackCooldownTicksRemaining = 0;
  private equippedRenderer: EquippedItemRenderer | null = null;
  private equippedRendererTypeId: ResourceId | null = null;

  constructor(
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

    this.equippedItemContainer = new PIXI.Container();
    this.equippedItemSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.equippedItemSprite.anchor.set(0.5, 0.5);
    this.equippedItemContainer.visible = false;
    this.equippedItemContainer.addChild(this.equippedItemSprite);

    this.damageFlashGraphic = new PIXI.Graphics();
    this.damageFlashGraphic.alpha = 0;
    this.damageFlashGraphic.visible = false;
    this.entityContainer.addChild(this.damageFlashGraphic);
    this.entityContainer.addChild(this.equippedItemContainer);

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

    this.syncEquippedItem(entity);
    const cooldownTicksRemaining =
      entity.equippedItem?.cooldownTicksRemaining ?? 0;
    if (
      cooldownTicksRemaining > 0 &&
      this.lastAttackCooldownTicksRemaining <= 0
    ) {
      this.playAttackAnimation(entity);
    }
    this.lastAttackCooldownTicksRemaining = cooldownTicksRemaining;
  }

  public update(deltaMs: number, entity: ClientEntity): void {
    this.damageFlashRemainingMs = Math.max(
      0,
      this.damageFlashRemainingMs - deltaMs,
    );
    this.attackAnimationRemainingMs = Math.max(
      0,
      this.attackAnimationRemainingMs - deltaMs,
    );
    this.syncDamageFlashVisual();
    this.syncEquippedItemAnimation(entity);
  }

  public playAttackAnimation(entity: ClientEntity): void {
    const weaponContent = entity.equippedItem
      ? getWeaponContent(entity.equippedItem.typeId)
      : undefined;
    if (!entity.equippedItem || !weaponContent) {
      return;
    }

    const cooldownDurationMs =
      (weaponContent.cooldownTicks * 1000) / this.pixiRenderer.getTickRate();
    switch (weaponContent.attackStyle) {
      case "shoot":
        this.attackAnimationDurationMs = Math.max(100, cooldownDurationMs);
        break;
      case "swing":
        this.attackAnimationDurationMs = Math.max(100, cooldownDurationMs);
        break;
      case "jab":
        this.attackAnimationDurationMs = 200;
        break;
    }
    this.attackAnimationRemainingMs = this.attackAnimationDurationMs;
    this.getEquippedItemRenderer(
      entity.equippedItem.typeId,
      weaponContent.attackStyle,
    ).onAttackStart?.(
      this.buildEquippedRenderContext(
        entity,
        entity.equippedItem.typeId,
        weaponContent,
      ),
    );
    this.syncEquippedItemAnimation(entity);
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
    this.equippedItemSprite.destroy();
    this.equippedItemContainer.destroy();
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
    const ratio = Math.max(
      0,
      Math.min(1, entity.hp / Math.max(1, entity.maxHp)),
    );
    const left = entity.hitboxBounds.centerX - width / 2;
    const top = entity.hitboxBounds.minY - 12;

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

  private syncDamageFlashVisual(): void {
    const alpha =
      this.damageFlashDurationMs <= 0
        ? 0
        : (this.damageFlashRemainingMs / this.damageFlashDurationMs) * 0.7;
    this.damageFlashGraphic.alpha = alpha;
    this.damageFlashGraphic.visible = alpha > 0.001;
  }

  private syncEquippedItem(entity: ClientEntity): void {
    const equippedItem = entity.equippedItem;
    if (!equippedItem) {
      this.equippedItemContainer.visible = false;
      this.equippedRenderer = null;
      this.equippedRendererTypeId = null;
      return;
    }

    const itemContent = getItemContent(equippedItem.typeId);
    const weaponContent = getWeaponContent(equippedItem.typeId);
    if (!itemContent || !weaponContent) {
      this.equippedItemContainer.visible = false;
      this.equippedRenderer = null;
      this.equippedRendererTypeId = null;
      return;
    }

    const renderManifest = weaponContent.equippedRender;
    const textureTypeId =
      renderManifest.textureTypeId ??
      itemContent.iconTextureId ??
      equippedItem.typeId;
    const renderer = this.getEquippedItemRenderer(
      equippedItem.typeId,
      weaponContent.attackStyle,
    );

    this.equippedItemContainer.visible = entity.alive;
    const context = this.buildEquippedRenderContext(
      entity,
      equippedItem.typeId,
      weaponContent,
    );
    renderer.syncStatic({
      ...context,
      container: this.equippedItemContainer,
      sprite: this.equippedItemSprite,
      texture: this.pixiRenderer.getItemTexture(textureTypeId),
    });
    this.syncEquippedItemAnimation(entity);
  }

  private syncEquippedItemAnimation(entity: ClientEntity): void {
    const equippedItem = entity.equippedItem;
    const weaponContent = equippedItem
      ? getWeaponContent(equippedItem.typeId)
      : undefined;
    if (!equippedItem || !weaponContent) {
      this.equippedItemContainer.visible = false;
      return;
    }
    const renderer = this.getEquippedItemRenderer(
      equippedItem.typeId,
      weaponContent.attackStyle,
    );
    renderer.syncAnimated({
      ...this.buildEquippedRenderContext(
        entity,
        equippedItem.typeId,
        weaponContent,
      ),
      container: this.equippedItemContainer,
      sprite: this.equippedItemSprite,
    });
  }

  private buildEquippedRenderContext(
    entity: ClientEntity,
    typeId: ResourceId,
    weaponContent: WeaponContent,
  ): EquippedRenderContext {
    const progress =
      this.attackAnimationDurationMs <= 0
        ? 0
        : 1 -
          this.attackAnimationRemainingMs /
            Math.max(1, this.attackAnimationDurationMs);
    const facingLeft = Math.cos(entity.rotation) < 0;
    return {
      entity,
      weaponContent,
      renderManifest: weaponContent.equippedRender,
      typeId,
      attackStyle: weaponContent.attackStyle,
      facingLeft,
      mirrorSign: facingLeft ? 1 : -1,
      progress,
      attackAnimationDurationMs: this.attackAnimationDurationMs,
    };
  }

  private getEquippedItemRenderer(
    typeId: ResourceId,
    attackStyle: EquippedRenderContext["attackStyle"],
  ): EquippedItemRenderer {
    if (this.equippedRenderer && this.equippedRendererTypeId === typeId) {
      return this.equippedRenderer;
    }
    const renderer = resolveEquippedItemRenderer({ typeId, attackStyle });
    this.equippedRenderer = renderer;
    this.equippedRendererTypeId = typeId;
    return renderer;
  }
}
