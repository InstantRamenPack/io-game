import { Building } from "@server/entities/Building.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Structure } from "@server/entities/Structure.ts";

export const COMBAT_OCCLUSION_EPSILON = 1e-6;

export function isCombatOccluder(
  entity: Entity,
): entity is Building | Structure {
  return entity instanceof Building || entity instanceof Structure;
}

export function getEntityRayEntryDistance(
  entity: Entity,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
): number | null {
  let nearestEntryDistance: number | null = null;

  for (const rect of entity.getWorldHitboxes()) {
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
