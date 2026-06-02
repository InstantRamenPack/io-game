import type { ItemSpriteRendering } from "@shared/content/schema.ts";
import { toRadians } from "@client/render/entity/equipped/equippedMath.ts";

export type KatanaSwingOffsets = {
  startOffset: number;
  endOffset: number;
  middleOffset: number;
};

/** Portion of each sweep attack spent reaching the target arc; remainder holds pose. */
const SWEEP_STRIKE_PORTION = 0.35;

/** Stab combo timing within a single attack cycle (must sum to 1). */
const STAB_THRUST_PORTION = 0.22;
const STAB_RECOVER_PORTION = 0.16;

export function resolveKatanaSwingOffsets(
  renderManifest: ItemSpriteRendering,
  facingLeft: boolean,
): KatanaSwingOffsets {
  const halfArcRad = toRadians(renderManifest.swingAngleDeg * 0.5);
  const startOffset = facingLeft ? halfArcRad : -halfArcRad;
  const endOffset = -startOffset;
  return {
    startOffset,
    endOffset,
    middleOffset: (startOffset + endOffset) * 0.5,
  };
}

/** First combo hit: sweep down and hold at the low point (no return-to-idle). */
export function katanaSweepDownRotationOffset(
  progress: number,
  offsets: KatanaSwingOffsets,
): number {
  if (progress >= SWEEP_STRIKE_PORTION) {
    return offsets.endOffset;
  }
  const strikeT = progress / Math.max(Number.EPSILON, SWEEP_STRIKE_PORTION);
  return lerp(offsets.startOffset, offsets.endOffset, easeOutQuad(strikeT));
}

/** Second combo hit: sweep from the held low point back to center (no overshoot). */
export function katanaSweepUpRotationOffset(
  progress: number,
  offsets: KatanaSwingOffsets,
): number {
  if (progress >= SWEEP_STRIKE_PORTION) {
    return offsets.startOffset;
  }
  const strikeT = progress / Math.max(Number.EPSILON, SWEEP_STRIKE_PORTION);
  return lerp(offsets.endOffset, offsets.startOffset, easeOutQuad(strikeT));
}

export type KatanaStabComboPose = {
  rotationOffset: number;
  spriteX: number;
  spriteY: number;
};

/**
 * Third combo hit: snap to middle, thrust, recover thrust, then swing back up.
 */
export function katanaStabComboPose(
  progress: number,
  offsets: KatanaSwingOffsets,
  renderManifest: ItemSpriteRendering,
  jabDistance: number,
  mirrorSign: 1 | -1,
): KatanaStabComboPose {
  const thrustEnd = STAB_THRUST_PORTION;
  const recoverEnd = thrustEnd + STAB_RECOVER_PORTION;
  const baseY = renderManifest.y;

  const resolveSpriteX = (jabT: number): number =>
    (renderManifest.x + jabDistance * jabT) * (mirrorSign === 1 ? 1 : -1);

  if (progress <= thrustEnd) {
    const t = progress / Math.max(Number.EPSILON, thrustEnd);
    const jabT = easeOutQuad(t);
    return {
      rotationOffset: lerp(
        offsets.startOffset,
        offsets.middleOffset,
        easeOutQuad(t),
      ),
      spriteX: resolveSpriteX(jabT),
      spriteY: baseY,
    };
  }

  if (progress <= recoverEnd) {
    const t =
      (progress - thrustEnd) / Math.max(Number.EPSILON, recoverEnd - thrustEnd);
    const jabT = 1 - easeInQuad(t);
    return {
      rotationOffset: offsets.middleOffset,
      spriteX: resolveSpriteX(jabT),
      spriteY: baseY,
    };
  }

  const returnT =
    (progress - recoverEnd) / Math.max(Number.EPSILON, 1 - recoverEnd);
  return {
    rotationOffset: lerp(
      offsets.middleOffset,
      offsets.startOffset,
      easeOutQuad(returnT),
    ),
    spriteX: resolveSpriteX(0),
    spriteY: baseY,
  };
}

/** Ease a held combo pose back to idle after the chain window expires. */
export function katanaChainBreakRecoverRotationOffset(
  progress: number,
  fromOffset: number,
  toOffset: number,
): number {
  return lerp(fromOffset, toOffset, easeInQuad(Math.min(1, Math.max(0, progress))));
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
