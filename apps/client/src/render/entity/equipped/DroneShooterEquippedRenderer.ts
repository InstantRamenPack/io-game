import { RangedEquippedRenderer } from "@client/render/entity/equipped/RangedEquippedRenderer.ts";
import type { EquippedAnimatedSyncInput } from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import {
  getOrbitRadius,
  toRadians,
} from "@client/render/entity/equipped/equippedMath.ts";

export class DroneShooterEquippedRenderer extends RangedEquippedRenderer {
  public override syncAnimated(input: EquippedAnimatedSyncInput): void {
    const { container, sprite, renderManifest, entity, progress } = input;
    const pulse = Math.sin(progress * Math.PI);
    const snappyCurve = Math.pow(Math.max(0, pulse), 0.68);
    const orbitRadius = getOrbitRadius(renderManifest.holdOffset);
    const recoilScale = 1.2;
    sprite.position.set(
      orbitRadius - renderManifest.recoilDistance * recoilScale * snappyCurve,
      0,
    );
    container.rotation =
      entity.rotation + toRadians(renderManifest.holdRotationDeg);
  }
}
