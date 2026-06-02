import { RangedEquippedRenderer } from "@client/render/entity/equipped/RangedEquippedRenderer.ts";
import type { EquippedAnimatedSyncInput } from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import {
  getOrbitRadius,
  toRadians,
} from "@client/render/entity/equipped/equippedMath.ts";

export class DroneShooterEquippedRenderer extends RangedEquippedRenderer {
  public override syncAnimated(input: EquippedAnimatedSyncInput): void {
    const {
      container,
      sprite,
      renderManifest,
      progress,
      mirrorSign,
      facingLeft,
    } = input;
    const pulse = Math.sin(progress * Math.PI);
    const snappyCurve = Math.pow(Math.max(0, pulse), 0.68);
    // Scale recoil by orbit radius so smaller-held items recoil less visually.
    const recoilScale = getOrbitRadius(renderManifest) / 16;
    const orbitX =
      renderManifest.x -
      renderManifest.recoilDistance * recoilScale * snappyCurve;
    const orbitY = renderManifest.y;
    sprite.position.set(mirrorSign === 1 ? orbitX : -orbitX, orbitY);
    container.rotation =
      input.rotation +
      toRadians(renderManifest.rotationDeg) +
      (facingLeft ? Math.PI : 0);
  }
}
