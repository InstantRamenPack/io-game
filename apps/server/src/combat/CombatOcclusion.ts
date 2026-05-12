import type { ResolvedHitboxRect } from "@shared/geometry/hitbox.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { StaticGeometryBlocker } from "@server/world/StaticGeometryIndex.ts";

export const COMBAT_OCCLUSION_EPSILON = 1e-6;

export function getEntityRayEntryDistance(
  entity: Entity,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
): number | null {
  return getRayEntryDistanceToHitboxes(
    entity.getWorldHitboxes(),
    originX,
    originY,
    directionX,
    directionY,
  );
}

export function getBlockerRayEntryDistance(
  blocker: StaticGeometryBlocker,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
): number | null {
  return getRayIntersectionEntryDistanceToHitboxes(
    blocker.hitboxes,
    originX,
    originY,
    directionX,
    directionY,
  );
}

function getRayEntryDistanceToHitboxes(
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

function getRayIntersectionEntryDistanceToHitboxes(
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

function getRayIntersectionEntryDistanceToRect(
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

function intersectRayAxis(
  origin: number,
  direction: number,
  min: number,
  max: number,
  entryDistance: number,
  exitDistance: number,
): { entryDistance: number; exitDistance: number } | null {
  if (Math.abs(direction) <= COMBAT_OCCLUSION_EPSILON) {
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
    nextEntryDistance - nextExitDistance > COMBAT_OCCLUSION_EPSILON
  ) {
    return null;
  }

  return {
    entryDistance: nextEntryDistance,
    exitDistance: nextExitDistance,
  };
}
