import type {
  EquippedAnimatedSyncInput,
  EquippedItemRenderer,
  EquippedStaticSyncInput,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import {
  getOrbitRadius,
  toRadians,
} from "@client/render/entity/equipped/equippedMath.ts";

export class RangedEquippedRenderer implements EquippedItemRenderer {
  public syncStatic(input: EquippedStaticSyncInput): void {
    const { container, sprite, texture, renderManifest, entity, mirrorSign } =
      input;
    sprite.texture = texture;
    const baseScale = (42 * renderManifest.scale) / Math.max(1, texture.height);
    sprite.scale.x = baseScale;
    sprite.scale.y = baseScale;
    sprite.position.set(getOrbitRadius(renderManifest.holdOffset), 0);
    container.position.set(0, 0);
    container.rotation =
      entity.rotation + toRadians(renderManifest.holdRotationDeg);
  }

  public syncAnimated(input: EquippedAnimatedSyncInput): void {
    const { container, sprite, renderManifest, entity, progress } = input;
    const pulse = Math.sin(progress * Math.PI);
    const orbitRadius = getOrbitRadius(renderManifest.holdOffset);
    sprite.position.set(orbitRadius - renderManifest.recoilDistance * pulse, 0);
    container.rotation =
      entity.rotation + toRadians(renderManifest.holdRotationDeg);
  }
}
