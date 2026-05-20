import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type { HitboxRect } from "@shared/geometry/hitbox.ts";
import type * as PIXI from "pixi.js";

type RectEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type ResolvedRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type Interval = {
  start: number;
  end: number;
};

const DUNGEON_FLOOR_BASE = 0x4f4f4f;
const EDGE_EPSILON = 0.001;

export class DungeonRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    const rects = resolveLocalRects(entity.hitboxes);

    for (const rect of rects) {
      graphics
        .rect(
          rect.minX,
          rect.minY,
          rect.maxX - rect.minX,
          rect.maxY - rect.minY,
        )
        .fill({ color: fillColor, alpha });
    }

    for (const edge of getOuterEdges(rects)) {
      graphics.moveTo(edge.x1, edge.y1).lineTo(edge.x2, edge.y2);
    }
    graphics.stroke({ width: 2, color: 0x000000, alpha: lineAlpha });
  }

  protected getFillColor(): number {
    return DUNGEON_FLOOR_BASE;
  }
}

function resolveLocalRects(hitboxes: readonly HitboxRect[]): ResolvedRect[] {
  return hitboxes.map((hitbox) => ({
    minX: hitbox.offsetX - hitbox.width / 2,
    minY: hitbox.offsetY - hitbox.height / 2,
    maxX: hitbox.offsetX + hitbox.width / 2,
    maxY: hitbox.offsetY + hitbox.height / 2,
  }));
}

function getOuterEdges(rects: readonly ResolvedRect[]): RectEdge[] {
  const edges: RectEdge[] = [];
  for (const rect of rects) {
    addVerticalOuterEdges(edges, rect, rect.minX, "left", rects);
    addVerticalOuterEdges(edges, rect, rect.maxX, "right", rects);
    addHorizontalOuterEdges(edges, rect, rect.minY, "top", rects);
    addHorizontalOuterEdges(edges, rect, rect.maxY, "bottom", rects);
  }
  return edges;
}

function addVerticalOuterEdges(
  edges: RectEdge[],
  rect: ResolvedRect,
  x: number,
  side: "left" | "right",
  rects: readonly ResolvedRect[],
): void {
  const covered = rects
    .filter((other) => {
      if (other === rect) {
        return false;
      }
      const touches =
        side === "left"
          ? nearlyEqual(other.maxX, x)
          : nearlyEqual(other.minX, x);
      return (
        touches &&
        intervalsOverlap(rect.minY, rect.maxY, other.minY, other.maxY)
      );
    })
    .map((other) => ({
      start: Math.max(rect.minY, other.minY),
      end: Math.min(rect.maxY, other.maxY),
    }));

  for (const interval of subtractIntervals(rect.minY, rect.maxY, covered)) {
    edges.push({ x1: x, y1: interval.start, x2: x, y2: interval.end });
  }
}

function addHorizontalOuterEdges(
  edges: RectEdge[],
  rect: ResolvedRect,
  y: number,
  side: "top" | "bottom",
  rects: readonly ResolvedRect[],
): void {
  const covered = rects
    .filter((other) => {
      if (other === rect) {
        return false;
      }
      const touches =
        side === "top"
          ? nearlyEqual(other.maxY, y)
          : nearlyEqual(other.minY, y);
      return (
        touches &&
        intervalsOverlap(rect.minX, rect.maxX, other.minX, other.maxX)
      );
    })
    .map((other) => ({
      start: Math.max(rect.minX, other.minX),
      end: Math.min(rect.maxX, other.maxX),
    }));

  for (const interval of subtractIntervals(rect.minX, rect.maxX, covered)) {
    edges.push({ x1: interval.start, y1: y, x2: interval.end, y2: y });
  }
}

function subtractIntervals(
  start: number,
  end: number,
  covered: readonly Interval[],
): Interval[] {
  const result: Interval[] = [];
  let cursor = start;
  for (const interval of [...covered].sort((a, b) => a.start - b.start)) {
    if (interval.end <= cursor + EDGE_EPSILON) {
      continue;
    }
    if (interval.start > cursor + EDGE_EPSILON) {
      result.push({ start: cursor, end: interval.start });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < end - EDGE_EPSILON) {
    result.push({ start: cursor, end });
  }
  return result;
}

function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd) - EDGE_EPSILON;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EDGE_EPSILON;
}
