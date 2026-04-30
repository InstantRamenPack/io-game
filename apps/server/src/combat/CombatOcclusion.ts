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
  return getRayEntryDistanceToHitboxes(
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
