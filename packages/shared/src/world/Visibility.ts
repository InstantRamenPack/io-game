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

export function collectOccludingHitboxes(
  hitboxes: Iterable<ResolvedHitboxRect>,
): ResolvedHitboxRect[] {
  return [...hitboxes];
}
