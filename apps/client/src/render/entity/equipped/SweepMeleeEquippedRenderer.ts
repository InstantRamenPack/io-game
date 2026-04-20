import type {
  EquippedAnimatedSyncInput,
  EquippedItemRenderer,
  EquippedStaticSyncInput,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { BaseEquippedItemRenderer } from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import { toRadians } from "@client/render/entity/equipped/equippedMath.ts";

export class SweepMeleeEquippedRenderer
  extends BaseEquippedItemRenderer
  implements EquippedItemRenderer
{
  public override syncStatic(input: EquippedStaticSyncInput): void {
    const { container, renderManifest, facingLeft, entity } = input;
    super.syncStatic(input);

    const halfArcRad = toRadians(renderManifest.swingAngleDeg * 0.5);
    const idleOffset = facingLeft ? halfArcRad : -halfArcRad;
    container.rotation =
      entity.rotation +
      toRadians(renderManifest.holdRotationDeg) +
      idleOffset +
      (facingLeft ? Math.PI : 0);
  }

  public override syncAnimated(input: EquippedAnimatedSyncInput): void {
    const {
      container,
      sprite,
      renderManifest,
      entity,
      facingLeft,
      progress,
      attackAnimationDurationMs,
    } = input;
    const halfArcRad = toRadians(renderManifest.swingAngleDeg * 0.5);
    const startOffset = facingLeft ? halfArcRad : -halfArcRad;
    const endOffset = -startOffset;
    const swingDurationMs = 100;
    const swingPhaseCutoff = Math.min(
      1,
      swingDurationMs / Math.max(1, attackAnimationDurationMs),
    );
    let rotationOffset: number;
    if (progress <= swingPhaseCutoff) {
      const swingT = progress / Math.max(Number.EPSILON, swingPhaseCutoff);
      rotationOffset = lerp(startOffset, endOffset, easeOutQuad(swingT));
    } else {
      const recoverT =
        (progress - swingPhaseCutoff) /
        Math.max(Number.EPSILON, 1 - swingPhaseCutoff);
      rotationOffset = lerp(endOffset, startOffset, easeInQuad(recoverT));
    }
    sprite.position.set(
      renderManifest.holdOffset.x * (input.mirrorSign === 1 ? 1 : -1),
      renderManifest.holdOffset.y,
    );
    container.rotation =
      entity.rotation +
      toRadians(renderManifest.holdRotationDeg) +
      rotationOffset +
      (facingLeft ? Math.PI : 0);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeInQuad(t: number): number {
  return t * t;
}
