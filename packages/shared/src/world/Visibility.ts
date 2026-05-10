import type { ResolvedHitboxRect } from "@shared/geometry/hitbox.ts";
import type {
  ProceduralPoint,
  ProceduralRect,
  ProceduralWorldLayout,
} from "@shared/world/ProceduralWorld.ts";
import {
  getSectorForPoint,
  pointInRect,
} from "@shared/world/ProceduralWorld.ts";

export const OUTER_LIGHTS_OUT_RADIUS = 600;

export type VisibilityContext = {
  center: ProceduralPoint;
  radius: number;
  restricted: boolean;
};

export type VisibilityMapSector = ProceduralRect & {
  archetype: string;
  hasLightsOut: boolean;
};

export type VisibilityMap = {
  sectors: readonly VisibilityMapSector[];
};

export type VisibilityBlocker = ProceduralRect & {
  sourceEntityId?: number;
};

export function getVisibilityContext(
  layout: ProceduralWorldLayout | null,
  viewer: ProceduralPoint,
): VisibilityContext {
  if (!layout) {
    return {
      center: viewer,
      radius: Number.POSITIVE_INFINITY,
      restricted: false,
    };
  }
  const sector = getSectorForPoint(layout, viewer);
  return {
    center: viewer,
    radius: sector?.hasLightsOut
      ? OUTER_LIGHTS_OUT_RADIUS
      : Number.POSITIVE_INFINITY,
    restricted: Boolean(sector?.hasLightsOut),
  };
}

export function getVisibilityContextForMap(
  map: VisibilityMap | null,
  viewer: ProceduralPoint,
  options: { outdoorLightsActive?: boolean } = {},
): VisibilityContext {
  if (!map) {
    return {
      center: viewer,
      radius: Number.POSITIVE_INFINITY,
      restricted: false,
    };
  }
  const sector = map.sectors.find((candidate) =>
    pointInRect(viewer, candidate),
  );
  const outdoorLightsActive = options.outdoorLightsActive ?? true;
  const restricted =
    Boolean(sector?.hasLightsOut) ||
    (!outdoorLightsActive && sector !== undefined);
  return {
    center: viewer,
    radius: restricted ? OUTER_LIGHTS_OUT_RADIUS : Number.POSITIVE_INFINITY,
    restricted,
  };
}

export function isPointVisible(
  context: VisibilityContext,
  target: ProceduralPoint,
  blockers: readonly VisibilityBlocker[],
  options: { targetSourceEntityId?: number } = {},
): boolean {
  if (!context.restricted) {
    return true;
  }
  const dx = target.x - context.center.x;
  const dy = target.y - context.center.y;
  if (dx * dx + dy * dy > context.radius * context.radius) {
    return false;
  }
  for (const blocker of blockers) {
    if (
      options.targetSourceEntityId !== undefined &&
      blocker.sourceEntityId === options.targetSourceEntityId
    ) {
      continue;
    }
    if (pointInRect(context.center, blocker)) {
      continue;
    }
    if (pointInRect(target, blocker)) {
      return false;
    }
    if (segmentIntersectsRect(context.center, target, blocker)) {
      return false;
    }
  }
  return true;
}

export function collectOccludingHitboxes(
  hitboxes: Iterable<ResolvedHitboxRect>,
): ResolvedHitboxRect[] {
  return [...hitboxes];
}

function segmentIntersectsRect(
  start: ProceduralPoint,
  end: ProceduralPoint,
  rect: ProceduralRect,
): boolean {
  let tMin = 0;
  let tMax = 1;
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  for (const [p, q] of [
    [-dx, start.x - rect.minX],
    [dx, rect.maxX - start.x],
    [-dy, start.y - rect.minY],
    [dy, rect.maxY - start.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) {
        return false;
      }
      continue;
    }
    const t = q / p;
    if (p < 0) {
      tMin = Math.max(tMin, t);
    } else {
      tMax = Math.min(tMax, t);
    }
    if (tMin > tMax) {
      return false;
    }
  }

  return tMax >= 0 && tMin <= 1;
}
