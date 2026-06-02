import type {
  EquippedAnimatedSyncInput,
  EquippedItemRenderer,
  EquippedStaticSyncInput,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { BaseEquippedItemRenderer } from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { toRadians } from "@client/render/entity/equipped/equippedMath.ts";

export class RangedEquippedRenderer
  extends BaseEquippedItemRenderer
  implements EquippedItemRenderer
{
  public override syncStatic(input: EquippedStaticSyncInput): void {
    super.syncStatic(input);
  }

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
    const orbitX = renderManifest.x - renderManifest.recoilDistance * pulse;
    const orbitY = renderManifest.y;
    sprite.position.set(mirrorSign === 1 ? orbitX : -orbitX, orbitY);
    container.rotation =
      input.rotation +
      toRadians(renderManifest.rotationDeg) +
      (facingLeft ? Math.PI : 0);
  }
}
