import type { ProceduralRect } from "@shared/world/layoutTypes.ts";
import { PROCEDURAL_TILE_SIZE } from "@shared/world/layoutTypes.ts";
export function rectsOverlap(
  left: ProceduralRect,
  right: ProceduralRect,
): boolean {
  return !(
    left.maxX <= right.minX ||
    right.maxX <= left.minX ||
    left.maxY <= right.minY ||
    right.maxY <= left.minY
  );
}
export function rectAxisLength(rect: ProceduralRect, axis: "x" | "y"): number {
  return axis === "x" ? rect.maxX - rect.minX : rect.maxY - rect.minY;
}

export function splitRectAlongAxis(
  rect: ProceduralRect,
  vertical: boolean,
  ratio: number,
  halfGap: number,
): [ProceduralRect, ProceduralRect] {
  const edge = snapEdge(
    (vertical ? rect.minX : rect.minY) +
      rectAxisLength(rect, vertical ? "x" : "y") * ratio,
  );
  return vertical
    ? [
        { ...rect, maxX: edge - halfGap },
        { ...rect, minX: edge + halfGap },
      ]
    : [
        { ...rect, maxY: edge - halfGap },
        { ...rect, minY: edge + halfGap },
      ];
}

export function snap(value: number): number {
  return (
    Math.floor(value / PROCEDURAL_TILE_SIZE) * PROCEDURAL_TILE_SIZE +
    PROCEDURAL_TILE_SIZE / 2
  );
}

export function snapEdge(value: number): number {
  return Math.floor(value / PROCEDURAL_TILE_SIZE) * PROCEDURAL_TILE_SIZE;
}

export function distanceSquared(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
