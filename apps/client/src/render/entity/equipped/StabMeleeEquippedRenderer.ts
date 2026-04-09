import type {
  EquippedAnimatedSyncInput,
  EquippedItemRenderer,
  EquippedStaticSyncInput,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { BaseEquippedItemRenderer } from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import {
  toRadians,
} from "@client/render/entity/equipped/equippedMath.ts";

export class StabMeleeEquippedRenderer
  extends BaseEquippedItemRenderer
  implements EquippedItemRenderer
{
  public override syncStatic(input: EquippedStaticSyncInput): void {
    super.syncStatic(input);
  }

  public override syncAnimated(input: EquippedAnimatedSyncInput): void {
    const { container, sprite, renderManifest, entity, progress } = input;
    const pulse = Math.sin(progress * Math.PI);
    const offsetX =
      renderManifest.holdOffset.x + renderManifest.jabDistance * pulse;
    const offsetY = renderManifest.holdOffset.y;
    sprite.position.set(input.mirrorSign === 1 ? offsetX : -offsetX, offsetY);
    container.rotation =
      entity.rotation +
      toRadians(renderManifest.holdRotationDeg) +
      (input.facingLeft ? Math.PI : 0);
  }
}
