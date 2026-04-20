import { z } from "zod";

export const HitboxRectSchema = z.object({
  offsetX: z.number(),
  offsetY: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export type HitboxRect = z.infer<typeof HitboxRectSchema>;

export type HitboxBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type ResolvedHitboxRect = HitboxRect & {
  centerX: number;
  centerY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function makeHitboxRect(
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
): HitboxRect {
  return { offsetX, offsetY, width, height };
}

export function cloneHitboxRects(rects: readonly HitboxRect[]): HitboxRect[] {
  return rects.map((rect) => ({ ...rect }));
}

function resolveHitboxRect(
  originX: number,
  originY: number,
  rect: HitboxRect,
): ResolvedHitboxRect {
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  const centerX = originX + rect.offsetX;
  const centerY = originY + rect.offsetY;

  return {
    ...rect,
    centerX,
    centerY,
    minX: centerX - halfWidth,
    minY: centerY - halfHeight,
    maxX: centerX + halfWidth,
    maxY: centerY + halfHeight,
  };
}

export function resolveHitboxRects(
  originX: number,
  originY: number,
  rects: readonly HitboxRect[],
): ResolvedHitboxRect[] {
  return rects.map((rect) => resolveHitboxRect(originX, originY, rect));
}

export function getHitboxBounds(rects: readonly HitboxRect[]): HitboxBounds {
  if (rects.length === 0) {
    throw new Error("Hitbox profiles must contain at least one rectangle.");
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const rect of rects) {
    const resolvedRect = resolveHitboxRect(0, 0, rect);
    minX = Math.min(minX, resolvedRect.minX);
    minY = Math.min(minY, resolvedRect.minY);
    maxX = Math.max(maxX, resolvedRect.maxX);
    maxY = Math.max(maxY, resolvedRect.maxY);
  }

  return makeBounds(minX, minY, maxX, maxY);
}

export function offsetHitboxBounds(
  bounds: HitboxBounds,
  originX: number,
  originY: number,
): HitboxBounds {
  return makeBounds(
    bounds.minX + originX,
    bounds.minY + originY,
    bounds.maxX + originX,
    bounds.maxY + originY,
  );
}

export function expandHitboxBounds(
  bounds: HitboxBounds,
  padX: number,
  padY: number,
): HitboxBounds {
  return makeBounds(
    bounds.minX - padX,
    bounds.minY - padY,
    bounds.maxX + padX,
    bounds.maxY + padY,
  );
}

export function getHitboxDirectionalExtent(
  rects: readonly HitboxRect[],
  directionX: number,
  directionY: number,
): number {
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength <= Number.EPSILON) {
    return 0;
  }

  const unitX = directionX / directionLength;
  const unitY = directionY / directionLength;
  let maxProjection = Number.NEGATIVE_INFINITY;

  for (const rect of rects) {
    const projection =
      rect.offsetX * unitX +
      rect.offsetY * unitY +
      (rect.width / 2) * Math.abs(unitX) +
      (rect.height / 2) * Math.abs(unitY);
    maxProjection = Math.max(maxProjection, projection);
  }

  return maxProjection;
}

function makeBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): HitboxBounds {
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}
