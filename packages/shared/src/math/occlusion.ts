import type { ResolvedHitboxRect } from "@shared/geometry/hitbox.ts";

export const OCCLUSION_EPSILON = 1e-6;

export function getRayEntryDistanceToHitboxes(
  hitboxes: readonly ResolvedHitboxRect[],
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
): number | null {
  let nearestEntryDistance: number | null = null;

  for (const rect of hitboxes) {
    const centerProjection =
      (rect.centerX - originX) * directionX +
      (rect.centerY - originY) * directionY;
    const halfProjectionExtent =
      (rect.width * Math.abs(directionX) + rect.height * Math.abs(directionY)) /
      2;
    const entryDistance = centerProjection - halfProjectionExtent;
    const exitDistance = centerProjection + halfProjectionExtent;

    if (exitDistance < 0) {
      continue;
    }

    const clampedEntryDistance = Math.max(0, entryDistance);
    if (
      nearestEntryDistance === null ||
      clampedEntryDistance < nearestEntryDistance
    ) {
      nearestEntryDistance = clampedEntryDistance;
    }
  }

  return nearestEntryDistance;
}

export function getRayIntersectionEntryDistanceToHitboxes(
  hitboxes: readonly ResolvedHitboxRect[],
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
): number | null {
  let nearestEntryDistance: number | null = null;

  for (const rect of hitboxes) {
    const entryDistance = getRayIntersectionEntryDistanceToRect(
      rect,
      originX,
      originY,
      directionX,
      directionY,
    );
    if (entryDistance === null) {
      continue;
    }
    if (nearestEntryDistance === null || entryDistance < nearestEntryDistance) {
      nearestEntryDistance = entryDistance;
    }
  }

  return nearestEntryDistance;
}

export function getRayIntersectionEntryDistanceToRect(
  rect: ResolvedHitboxRect,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
): number | null {
  let entryDistance = 0;
  let exitDistance = Number.POSITIVE_INFINITY;

  const xResult = intersectRayAxis(
    originX,
    directionX,
    rect.minX,
    rect.maxX,
    entryDistance,
    exitDistance,
  );
  if (!xResult) {
    return null;
  }
  entryDistance = xResult.entryDistance;
  exitDistance = xResult.exitDistance;

  const yResult = intersectRayAxis(
    originY,
    directionY,
    rect.minY,
    rect.maxY,
    entryDistance,
    exitDistance,
  );
  if (!yResult) {
    return null;
  }

  return Math.max(0, yResult.entryDistance);
}

export function intersectRayAxis(
  origin: number,
  direction: number,
  min: number,
  max: number,
  entryDistance: number,
  exitDistance: number,
): { entryDistance: number; exitDistance: number } | null {
  if (Math.abs(direction) <= OCCLUSION_EPSILON) {
    return origin >= min && origin <= max
      ? { entryDistance, exitDistance }
      : null;
  }

  const firstDistance = (min - origin) / direction;
  const secondDistance = (max - origin) / direction;
  const axisEntryDistance = Math.min(firstDistance, secondDistance);
  const axisExitDistance = Math.max(firstDistance, secondDistance);
  const nextEntryDistance = Math.max(entryDistance, axisEntryDistance);
  const nextExitDistance = Math.min(exitDistance, axisExitDistance);

  if (
    nextExitDistance < 0 ||
    nextEntryDistance - nextExitDistance > OCCLUSION_EPSILON
  ) {
    return null;
  }

  return {
    entryDistance: nextEntryDistance,
    exitDistance: nextExitDistance,
  };
}
