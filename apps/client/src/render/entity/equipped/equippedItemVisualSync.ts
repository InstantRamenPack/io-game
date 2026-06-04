import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type {
  EquippedItemRenderer,
  EquippedRenderContext,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import type {
  ItemSpriteRendering,
  WeaponContent,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type * as PIXI from "pixi.js";

export const EQUIPPED_ITEM_SPRITE_ANCHOR = 0.5;

export function prepareEquippedItemSprite(sprite: PIXI.Sprite): void {
  sprite.anchor.set(EQUIPPED_ITEM_SPRITE_ANCHOR);
}

export function equippedAttackProgress(options: {
  attackAnimationRemainingMs: number;
  attackAnimationDurationMs: number;
}): number {
  if (options.attackAnimationDurationMs <= 0) {
    return 0;
  }
  return (
    1 -
    options.attackAnimationRemainingMs /
      Math.max(1, options.attackAnimationDurationMs)
  );
}

export function resolveAttackAnimationDurationMs(
  weaponContent: WeaponContent,
  tickRate: number,
): number {
  const cooldownDurationMs = (weaponContent.cooldownTicks * 1000) / tickRate;
  switch (weaponContent.attackStyle) {
    case "shoot":
    case "swing":
      return Math.max(100, cooldownDurationMs);
    case "jab":
      return 200;
  }
}

export function buildEquippedRenderContext(options: {
  entity: ClientEntity;
  rotation: number;
  typeId: ResourceId;
  weaponContent: WeaponContent;
  renderManifest: ItemSpriteRendering;
  attackAnimationRemainingMs: number;
  attackAnimationDurationMs: number;
}): EquippedRenderContext {
  const progress = equippedAttackProgress({
    attackAnimationRemainingMs: options.attackAnimationRemainingMs,
    attackAnimationDurationMs: options.attackAnimationDurationMs,
  });
  const facingLeft = Math.cos(options.rotation) < 0;
  const mirrorSign: 1 | -1 = facingLeft ? -1 : 1;

  return {
    entity: options.entity,
    rotation: options.rotation,
    weaponContent: options.weaponContent,
    renderManifest: options.renderManifest,
    typeId: options.typeId,
    attackStyle: options.weaponContent.attackStyle,
    facingLeft,
    mirrorSign,
    progress,
    attackAnimationDurationMs: options.attackAnimationDurationMs,
  };
}

export function syncEquippedItemVisual(options: {
  renderer: EquippedItemRenderer;
  context: EquippedRenderContext;
  container: PIXI.Container;
  sprite: PIXI.Sprite;
  texture: PIXI.Texture;
}): void {
  prepareEquippedItemSprite(options.sprite);
  options.renderer.syncStatic({
    ...options.context,
    container: options.container,
    sprite: options.sprite,
    texture: options.texture,
  });
  options.renderer.syncAnimated({
    ...options.context,
    container: options.container,
    sprite: options.sprite,
  });
}
