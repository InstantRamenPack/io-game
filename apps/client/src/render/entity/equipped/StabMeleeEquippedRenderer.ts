import type {
  EquippedAnimatedSyncInput,
  EquippedItemRenderer,
  EquippedStaticSyncInput,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { BaseEquippedItemRenderer } from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { toRadians } from "@client/render/entity/equipped/equippedMath.ts";

export class StabMeleeEquippedRenderer
  extends BaseEquippedItemRenderer
  implements EquippedItemRenderer
{
  public override syncStatic(input: EquippedStaticSyncInput): void {
    super.syncStatic(input);
  }

  public override syncAnimated(input: EquippedAnimatedSyncInput): void {
    const { container, sprite, renderManifest, progress } = input;
    const pulse = Math.sin(progress * Math.PI);
    const offsetX = renderManifest.x + renderManifest.jabDistance * pulse;
    const offsetY = renderManifest.y;
    sprite.position.set(input.mirrorSign === 1 ? offsetX : -offsetX, offsetY);
    container.rotation =
      input.rotation +
      toRadians(renderManifest.rotationDeg) +
      (input.facingLeft ? Math.PI : 0);
  }
}
