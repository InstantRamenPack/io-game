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
    sprite.width = 42 * renderManifest.scale;
    sprite.height = 42 * renderManifest.scale;
    sprite.scale.set(mirrorSign, 1);
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
