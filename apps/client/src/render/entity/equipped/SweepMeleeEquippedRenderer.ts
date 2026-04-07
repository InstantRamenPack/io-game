import type {
  EquippedAnimatedSyncInput,
  EquippedItemRenderer,
  EquippedStaticSyncInput,
} from "@client/render/entity/equipped/EquippedItemRenderer.ts";
import {
  getOrbitRadius,
  toRadians,
} from "@client/render/entity/equipped/equippedMath.ts";

export class SweepMeleeEquippedRenderer implements EquippedItemRenderer {
  public syncStatic(input: EquippedStaticSyncInput): void {
    const { container, sprite, texture, renderManifest, entity, mirrorSign } =
      input;
    sprite.texture = texture;
    sprite.width = 42 * renderManifest.scale;
    sprite.height = 42 * renderManifest.scale;
    sprite.scale.set(mirrorSign, 1);
    sprite.position.set(getOrbitRadius(renderManifest.holdOffset), 0);
    container.position.set(0, 0);
    const halfArcRad = toRadians(renderManifest.swingAngleDeg * 0.5);
    const idleOffset = input.facingLeft ? halfArcRad : -halfArcRad;
    container.rotation = entity.rotation + idleOffset;
  }

  public syncAnimated(input: EquippedAnimatedSyncInput): void {
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
    sprite.position.set(getOrbitRadius(renderManifest.holdOffset), 0);
    container.rotation = entity.rotation + rotationOffset;
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
