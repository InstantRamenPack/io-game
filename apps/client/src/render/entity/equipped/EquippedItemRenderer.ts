import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type {
  AttackStyle,
  ItemSpriteRendering,
  WeaponContent,
} from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type * as PIXI from "pixi.js";
import { toRadians } from "@client/render/entity/equipped/equippedMath.ts";

export type EquippedRenderContext = {
  entity: ClientEntity;
  rotation: number;
  weaponContent: WeaponContent;
  renderManifest: ItemSpriteRendering;
  typeId: ResourceId;
  attackStyle: AttackStyle;
  facingLeft: boolean;
  mirrorSign: 1 | -1;
  progress: number;
  attackAnimationDurationMs: number;
};

export type EquippedStaticSyncInput = EquippedRenderContext & {
  container: PIXI.Container;
  sprite: PIXI.Sprite;
  texture: PIXI.Texture;
};

export type EquippedAnimatedSyncInput = EquippedRenderContext & {
  container: PIXI.Container;
  sprite: PIXI.Sprite;
};

export interface EquippedItemRenderer {
  syncStatic(input: EquippedStaticSyncInput): void;
  syncAnimated(input: EquippedAnimatedSyncInput): void;
  onAttackStart?(context: EquippedRenderContext): void;
}

/**
 * Base class that implements common static synchronization for equipped
 * item sprites. Specialised renderers should extend this and call
 * super.syncStatic(input) before applying style-specific tweaks.
 */
export abstract class BaseEquippedItemRenderer implements EquippedItemRenderer {
  public syncStatic(input: EquippedStaticSyncInput): void {
    const {
      container,
      sprite,
      texture,
      renderManifest,
      mirrorSign,
      facingLeft,
    } = input;
    sprite.texture = texture;

    // Compute uniform scale so sprites have consistent visual size, then
    // apply handedness by multiplying X scale with mirrorSign.
    const desiredSize = 42 * renderManifest.scale;
    const scaleFactor = desiredSize / Math.max(1, texture.height);
    sprite.scale.set(scaleFactor * mirrorSign, scaleFactor);

    // Orbit/position should flip horizontally when mirrored so the weapon
    // stays on the correct side of the player.
    sprite.position.set(
      renderManifest.x * (mirrorSign === 1 ? 1 : -1),
      renderManifest.y,
    );

    container.rotation =
      input.rotation +
      toRadians(renderManifest.rotationDeg) +
      (facingLeft ? Math.PI : 0);
  }

  // Default animated sync does nothing; specific renderers may override.
  public syncAnimated(_input: EquippedAnimatedSyncInput): void {
    // no-op
  }
}
