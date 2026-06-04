import { BUILD_PLACEMENT_MAX_DISTANCE } from "@shared/gameplay/constants.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import type {
  HitboxBounds,
  ResolvedHitboxRect,
} from "@shared/geometry/hitbox.ts";

export type BuildPlacementValidationInput = {
  playerX: number;
  playerY: number;
  targetX: number;
  targetY: number;
  maxDistance: number;
  worldWidth: number;
  worldHeight: number;
  placementHitboxes: readonly ResolvedHitboxRect[];
  placementBounds: HitboxBounds;
  playerHitboxes?: readonly ResolvedHitboxRect[];
  blockerHitboxes: readonly (readonly ResolvedHitboxRect[])[];
};

export type BuildPlacementValidationResult =
  | {
      ok: true;
      snappedX: number;
      snappedY: number;
      distance: number;
    }
  | {
      ok: false;
      reason:
        | "out_of_range"
        | "out_of_bounds"
        | "overlaps_player"
        | "overlaps_blocker";
      distance: number;
    };

export function snapBuildPlacementTarget(
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  return {
    x: Math.round(targetX),
    y: Math.round(targetY),
  };
}

export function measureBuildPlacementDistance(input: {
  playerX: number;
  playerY: number;
  targetX: number;
  targetY: number;
}): number {
  return Math.hypot(
    input.targetX - input.playerX,
    input.targetY - input.playerY,
  );
}

export function validateBuildPlacement(
  input: BuildPlacementValidationInput,
): BuildPlacementValidationResult {
  const distance = measureBuildPlacementDistance(input);
  if (distance > input.maxDistance) {
    return { ok: false, reason: "out_of_range", distance };
  }

  const snapped = snapBuildPlacementTarget(input.targetX, input.targetY);
  const { minX, minY, maxX, maxY } = input.placementBounds;
  if (
    minX < 0 ||
    minY < 0 ||
    maxX > input.worldWidth ||
    maxY > input.worldHeight
  ) {
    return { ok: false, reason: "out_of_bounds", distance };
  }

  if (
    input.playerHitboxes &&
    doResolvedRectSetsOverlap(
      input.placementHitboxes,
      input.playerHitboxes,
    )
  ) {
    return { ok: false, reason: "overlaps_player", distance };
  }

  for (const blocker of input.blockerHitboxes) {
    if (doResolvedRectSetsOverlap(input.placementHitboxes, blocker)) {
      return { ok: false, reason: "overlaps_blocker", distance };
    }
  }

  return {
    ok: true,
    snappedX: snapped.x,
    snappedY: snapped.y,
    distance,
  };
}

export function isBuildPlacementWithinDefaultRange(input: {
  playerX: number;
  playerY: number;
  targetX: number;
  targetY: number;
}): boolean {
  return (
    measureBuildPlacementDistance(input) <= BUILD_PLACEMENT_MAX_DISTANCE
  );
}
