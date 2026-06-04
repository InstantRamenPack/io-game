import type { ResolvedHitboxRect } from "@shared/geometry/hitbox.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { StaticGeometryBlocker } from "@server/world/StaticGeometryIndex.ts";
import {
  getRayEntryDistanceToHitboxes,
  getRayIntersectionEntryDistanceToHitboxes,
  OCCLUSION_EPSILON,
} from "@shared/math/occlusion.ts";

export const COMBAT_OCCLUSION_EPSILON = OCCLUSION_EPSILON;

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

export {
  getRayEntryDistanceToHitboxes,
  getRayIntersectionEntryDistanceToHitboxes,
} from "@shared/math/occlusion.ts";

export type { ResolvedHitboxRect };
