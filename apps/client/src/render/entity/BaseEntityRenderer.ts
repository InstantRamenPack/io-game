import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import type {
  EquippedRenderContext,
  EquippedItemRenderer,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { resolveEquippedItemRenderer } from "@client/render/entity/equipped/EquippedItemRendererRegistry.ts";
import type {
  EntityPresentationState,
  EntityRenderer,
  EntityRendererOptions,
} from "@client/render/entity/EntityRenderer.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import { getItemContent, getWeaponContent } from "@shared/content/catalog.ts";
import { getHitboxDirectionalExtent } from "@shared/geometry/hitbox.ts";
import type { WeaponContent } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import * as PIXI from "pixi.js";

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
  // Graphics used to render equipped-weapon attack shapes (swing/jab) behind
  // the equipped item sprite when debug hitboxes are enabled.
  protected readonly equippedHitboxGraphic?: PIXI.Graphics;
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
      // Create a per-entity equipped hitbox graphic and insert it just
      // before the equipped item container so it renders behind the weapon
      // sprite itself.
      this.equippedHitboxGraphic = new PIXI.Graphics();
      const insertIndex = this.entityContainer.getChildIndex(
        this.equippedItemContainer,
      );
      this.entityContainer.addChildAt(
        this.equippedHitboxGraphic,
        Math.max(0, insertIndex),
      );
    }

    if (debugInterpolationMode > 0) {
      this.debugContainer = new PIXI.Container();
      pixiRenderer.entityContainer.addChild(this.debugContainer);

      this.debugGraphic = new PIXI.Graphics();
      this.debugContainer.addChild(this.debugGraphic);
    }
  }

  public sync(
    entity: ClientEntity,
    presentation?: EntityPresentationState,
  ): void {
    const visualX = presentation?.x ?? entity.x;
    const visualY = presentation?.y ?? entity.y;
    const visualRotation = presentation?.rotation ?? entity.rotation;
    this.entityContainer.position.set(visualX, visualY);

    if (this.hitboxContainer) {
      this.hitboxContainer.position.set(entity.x, entity.y);
    }

    if (this.debugContainer) {
      this.debugContainer.position.set(entity.serverX, entity.serverY);
      this.debugContainer.rotation = entity.rotation;
    }

    if (this.pixiRenderer.playerEntityId === entity.id) {
      this.pixiRenderer.setCameraToPlayer(visualX, visualY);
      this.pixiRenderer.setPlayerPosition(visualX, visualY);
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

    this.syncEquippedItem(entity, visualRotation);
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

  public update(
    deltaMs: number,
    entity: ClientEntity,
    presentation?: EntityPresentationState,
  ): void {
    this.damageFlashRemainingMs = Math.max(
      0,
      this.damageFlashRemainingMs - deltaMs,
    );
    this.attackAnimationRemainingMs = Math.max(
      0,
      this.attackAnimationRemainingMs - deltaMs,
    );
    this.syncDamageFlashVisual();
    this.syncEquippedItemAnimation(
      entity,
      presentation?.rotation ?? entity.rotation,
    );
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
        entity.rotation,
        entity.equippedItem.typeId,
        weaponContent,
      ),
    );
    this.syncEquippedItemAnimation(entity, entity.rotation);
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
    this.equippedHitboxGraphic?.destroy();
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

  protected redrawPresentation(entity: ClientEntity): void {
    const fillColor = this.getFillColor(entity);

    this.drawEntityShape(this.entityGraphic, entity, fillColor, 1, 1);
    this.drawEntityShape(this.damageFlashGraphic, entity, 0xff4242, 1, 1);

    if (this.hitboxGraphic) {
      this.hitboxGraphic.clear();
      for (const hitbox of entity.hitboxes) {
        this.hitboxGraphic.rect(
          hitbox.offsetX - hitbox.width / 2,
          hitbox.offsetY - hitbox.height / 2,
          hitbox.width,
          hitbox.height,
        );
      }
      this.hitboxGraphic.stroke({ width: 2, color: 0x2d68ff, alpha: 0.8 });
    }

    if (this.debugGraphic) {
      this.drawEntityShape(this.debugGraphic, entity, fillColor, 0.2, 0.35);
    }
    // Also update any equipped-weapon attack hitbox visuals (swing/jab).
    this.redrawEquippedHitbox(entity, entity.rotation);
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

    drawRoundedRect(this.healthBarTrackGraphic, left, top, width, height, 3, {
      color: 0x1b1b1b,
      alpha: 0.85,
    });
    drawRoundedRect(
      this.healthBarFillGraphic,
      left,
      top,
      width * ratio,
      height,
      3,
      { color: 0x57d34d, alpha: 0.95 },
    );
  }

  private syncDamageFlashVisual(): void {
    const alpha =
      this.damageFlashDurationMs <= 0
        ? 0
        : (this.damageFlashRemainingMs / this.damageFlashDurationMs) * 0.7;
    this.damageFlashGraphic.alpha = alpha;
    this.damageFlashGraphic.visible = alpha > 0.001;
  }

  private syncEquippedItem(entity: ClientEntity, rotation: number): void {
    const equippedItem = entity.equippedItem;
    if (!equippedItem) {
      this.equippedItemContainer.visible = false;
      this.resetEquippedItemContainerChildren();
      this.equippedRenderer = null;
      this.equippedRendererTypeId = null;
      return;
    }

    const itemContent = getItemContent(equippedItem.typeId);
    const weaponContent = getWeaponContent(equippedItem.typeId);
    if (!itemContent || !weaponContent) {
      this.equippedItemContainer.visible = false;
      this.resetEquippedItemContainerChildren();
      this.equippedRenderer = null;
      this.equippedRendererTypeId = null;
      return;
    }

    const renderManifest = weaponContent.equippedRender;
    const renderer = this.getEquippedItemRenderer(
      equippedItem.typeId,
      weaponContent.attackStyle,
    );

    this.equippedItemContainer.visible = entity.alive;
    const context = this.buildEquippedRenderContext(
      entity,
      rotation,
      equippedItem.typeId,
      weaponContent,
    );
    const textureTypeId =
      renderManifest.textureTypeId ??
      itemContent.iconTextureId ??
      equippedItem.typeId;
    renderer.syncStatic({
      ...context,
      container: this.equippedItemContainer,
      sprite: this.equippedItemSprite,
      texture: this.pixiRenderer.getItemSpriteTexture(textureTypeId),
    });
    this.syncEquippedItemAnimation(entity, rotation);
  }

  private syncEquippedItemAnimation(
    entity: ClientEntity,
    rotation: number,
  ): void {
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
        rotation,
        equippedItem.typeId,
        weaponContent,
      ),
      container: this.equippedItemContainer,
      sprite: this.equippedItemSprite,
    });
    // Update equipped-weapon debug hitbox each frame so it follows the
    // current aim/animation state.
    this.redrawEquippedHitbox(entity, rotation);
  }

  private redrawEquippedHitbox(entity: ClientEntity, rotation: number): void {
    if (!this.equippedHitboxGraphic) {
      return;
    }
    this.equippedHitboxGraphic.clear();

    const equippedItem = entity.equippedItem;
    if (!equippedItem) {
      return;
    }
    const weaponContent = getWeaponContent(equippedItem.typeId);
    if (!weaponContent) {
      return;
    }

    // Compute aim direction from entity rotation (server stores aim in
    // entity.rotation).
    const dirX = Math.cos(rotation);
    const dirY = Math.sin(rotation);

    // Visual style for equipped attack hitboxes.
    const fillColor = 0xff6b6b;
    const fillAlpha = 0.28;
    const strokeColor = 0xff4242;
    const strokeAlpha = 0.9;

    const attackStyle = weaponContent.attackStyle;
    if (attackStyle === "swing") {
      const swingContent = weaponContent as Extract<
        WeaponContent,
        { attackStyle: "swing" }
      >;
      const reach =
        getHitboxDirectionalExtent(entity.hitboxes, dirX, dirY) +
        swingContent.range;
      const halfArc = (swingContent.sweepArcDeg * Math.PI) / 360;
      const start = rotation - halfArc;
      const end = rotation + halfArc;

      this.equippedHitboxGraphic.beginFill(fillColor, fillAlpha);
      this.equippedHitboxGraphic.lineStyle(2, strokeColor, strokeAlpha);
      // Draw a filled sector (pie slice) centered on the entity origin.
      this.equippedHitboxGraphic.moveTo(0, 0);
      this.equippedHitboxGraphic.arc(0, 0, reach, start, end);
      this.equippedHitboxGraphic.lineTo(0, 0);
      this.equippedHitboxGraphic.endFill();
    } else if (attackStyle === "jab") {
      const jabContent = weaponContent as Extract<
        WeaponContent,
        { attackStyle: "jab" }
      >;
      const reach =
        getHitboxDirectionalExtent(entity.hitboxes, dirX, dirY) +
        jabContent.range;
      const halfWidth = jabContent.jabWidth / 2;
      const perpX = -dirY;
      const perpY = dirX;

      const p1x = perpX * halfWidth;
      const p1y = perpY * halfWidth;
      const p2x = -perpX * halfWidth;
      const p2y = -perpY * halfWidth;
      const endX = dirX * reach;
      const endY = dirY * reach;
      const p3x = endX + perpX * halfWidth;
      const p3y = endY + perpY * halfWidth;
      const p4x = endX - perpX * halfWidth;
      const p4y = endY - perpY * halfWidth;

      this.equippedHitboxGraphic.beginFill(fillColor, fillAlpha);
      this.equippedHitboxGraphic.lineStyle(2, strokeColor, strokeAlpha);
      this.equippedHitboxGraphic.moveTo(p1x, p1y);
      this.equippedHitboxGraphic.lineTo(p3x, p3y);
      this.equippedHitboxGraphic.lineTo(p4x, p4y);
      this.equippedHitboxGraphic.lineTo(p2x, p2y);
      this.equippedHitboxGraphic.lineTo(p1x, p1y);
      this.equippedHitboxGraphic.endFill();
    }
  }

  private buildEquippedRenderContext(
    entity: ClientEntity,
    rotation: number,
    typeId: ResourceId,
    weaponContent: WeaponContent,
  ): EquippedRenderContext {
    const progress =
      this.attackAnimationDurationMs <= 0
        ? 0
        : 1 -
          this.attackAnimationRemainingMs /
            Math.max(1, this.attackAnimationDurationMs);
    const facingLeft = Math.cos(rotation) < 0;
    // Consider the item's drawn handedness when deciding whether to mirror the
    // sprite. Some assets are authored facing right, others facing left. The
    // equippedRender.handedness field indicates which direction the sprite is
    // authored for. We compute mirrorSign so that the final displayed sprite
    // faces the aim direction (pointing right when the player aims right, and
    // mirrored when aiming left).
    const renderManifest = weaponContent.equippedRender;
    const assetFacesRight = renderManifest.handedness === "right";
    const mirrorSign: 1 | -1 = assetFacesRight === facingLeft ? -1 : 1;

    return {
      entity,
      rotation,
      weaponContent,
      renderManifest: renderManifest,
      typeId,
      attackStyle: weaponContent.attackStyle,
      facingLeft,
      mirrorSign,
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
    this.resetEquippedItemContainerChildren();
    const renderer = resolveEquippedItemRenderer({ typeId, attackStyle });
    this.equippedRenderer = renderer;
    this.equippedRendererTypeId = typeId;
    return renderer;
  }

  private resetEquippedItemContainerChildren(): void {
    for (const child of [...this.equippedItemContainer.children]) {
      if (child === this.equippedItemSprite) {
        continue;
      }
      this.equippedItemContainer.removeChild(child);
      child.destroy();
    }
    this.equippedItemSprite.visible = true;
  }
}
