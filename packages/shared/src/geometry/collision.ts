import type { ResolvedHitboxRect } from "@shared/geometry/hitbox.ts";

export type AxisSeparation = {
  axis: "x" | "y";
  translation: number;
};

type Point2D = {
  x: number;
  y: number;
};

type Segment2D = {
  start: Point2D;
  end: Point2D;
};

function doResolvedRectsOverlap(
  leftRect: ResolvedHitboxRect,
  rightRect: ResolvedHitboxRect,
): boolean {
  return (
    leftRect.minX < rightRect.maxX &&
    leftRect.maxX > rightRect.minX &&
    leftRect.minY < rightRect.maxY &&
    leftRect.maxY > rightRect.minY
  );
}

export function doResolvedRectSetsOverlap(
  leftRects: readonly ResolvedHitboxRect[],
  rightRects: readonly ResolvedHitboxRect[],
): boolean {
  for (const leftRect of leftRects) {
    for (const rightRect of rightRects) {
      if (doResolvedRectsOverlap(leftRect, rightRect)) {
        return true;
      }
    }
  }

  return false;
}

export function getResolvedRectSetSeparation(
  leftRects: readonly ResolvedHitboxRect[],
  rightRects: readonly ResolvedHitboxRect[],
): AxisSeparation | null {
  let moveLeft = Number.POSITIVE_INFINITY;
  let moveRight = Number.NEGATIVE_INFINITY;
  let moveUp = Number.POSITIVE_INFINITY;
  let moveDown = Number.NEGATIVE_INFINITY;
  let hasOverlap = false;

  for (const leftRect of leftRects) {
    for (const rightRect of rightRects) {
      if (!doResolvedRectsOverlap(leftRect, rightRect)) {
        continue;
      }

      hasOverlap = true;
      moveLeft = Math.min(moveLeft, rightRect.minX - leftRect.maxX);
      moveRight = Math.max(moveRight, rightRect.maxX - leftRect.minX);
      moveUp = Math.min(moveUp, rightRect.minY - leftRect.maxY);
      moveDown = Math.max(moveDown, rightRect.maxY - leftRect.minY);
    }
  }

  if (!hasOverlap) {
    return null;
  }

  const candidates: AxisSeparation[] = [
    { axis: "x", translation: moveLeft },
    { axis: "x", translation: moveRight },
    { axis: "y", translation: moveUp },
    { axis: "y", translation: moveDown },
  ];
  const [firstCandidate, ...remainingCandidates] = candidates;
  if (!firstCandidate) {
    return null;
  }

  let bestCandidate = firstCandidate;
  for (const candidate of remainingCandidates) {
    if (Math.abs(candidate.translation) < Math.abs(bestCandidate.translation)) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function getClosestPointOnResolvedRect(
  rect: ResolvedHitboxRect,
  x: number,
  y: number,
): Point2D {
  return {
    x: Math.min(rect.maxX, Math.max(rect.minX, x)),
    y: Math.min(rect.maxY, Math.max(rect.minY, y)),
  };
}

function getDistanceSquaredToResolvedRect(
  rect: ResolvedHitboxRect,
  x: number,
  y: number,
): number {
  const closestPoint = getClosestPointOnResolvedRect(rect, x, y);
  const deltaX = closestPoint.x - x;
  const deltaY = closestPoint.y - y;
  return deltaX * deltaX + deltaY * deltaY;
}

export function getDistanceSquaredToResolvedRectSet(
  rects: readonly ResolvedHitboxRect[],
  x: number,
  y: number,
): number {
  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const rect of rects) {
    bestDistanceSquared = Math.min(
      bestDistanceSquared,
      getDistanceSquaredToResolvedRect(rect, x, y),
    );
  }

  return bestDistanceSquared;
}

export function doesResolvedRectIntersectOrientedBox(
  rect: ResolvedHitboxRect,
  boxCenterX: number,
  boxCenterY: number,
  forwardX: number,
  forwardY: number,
  halfLength: number,
  halfWidth: number,
): boolean {
  const perpendicularAxis = getPerpendicularAxis(forwardX, forwardY);
  const perpendicularX = perpendicularAxis.x;
  const perpendicularY = perpendicularAxis.y;
  const rectHalfWidth = rect.width / 2;
  const rectHalfHeight = rect.height / 2;
  const deltaX = rect.centerX - boxCenterX;
  const deltaY = rect.centerY - boxCenterY;

  return (
    overlapsRectAndOrientedBoxOnAxis(
      deltaX,
      deltaY,
      1,
      0,
      rectHalfWidth,
      rectHalfHeight,
      halfLength,
      halfWidth,
      forwardX,
      forwardY,
      perpendicularX,
      perpendicularY,
    ) &&
    overlapsRectAndOrientedBoxOnAxis(
      deltaX,
      deltaY,
      0,
      1,
      rectHalfWidth,
      rectHalfHeight,
      halfLength,
      halfWidth,
      forwardX,
      forwardY,
      perpendicularX,
      perpendicularY,
    ) &&
    overlapsRectAndOrientedBoxOnAxis(
      deltaX,
      deltaY,
      forwardX,
      forwardY,
      rectHalfWidth,
      rectHalfHeight,
      halfLength,
      halfWidth,
      forwardX,
      forwardY,
      perpendicularX,
      perpendicularY,
    ) &&
    overlapsRectAndOrientedBoxOnAxis(
      deltaX,
      deltaY,
      perpendicularX,
      perpendicularY,
      rectHalfWidth,
      rectHalfHeight,
      halfLength,
      halfWidth,
      forwardX,
      forwardY,
      perpendicularX,
      perpendicularY,
    )
  );
}

export function doesResolvedRectIntersectSweepArc(
  rect: ResolvedHitboxRect,
  originX: number,
  originY: number,
  aimAngle: number,
  directionX: number,
  directionY: number,
  maxDistance: number,
  halfArcRadians: number,
): boolean {
  if (isPointInsideResolvedRect(rect, originX, originY)) {
    return true;
  }

  const minDot = Math.cos(halfArcRadians);
  const samplePoints = [
    getClosestPointOnResolvedRect(rect, originX, originY),
    ...getResolvedRectSamplePoints(rect),
  ];
  if (
    samplePoints.some((point) =>
      isPointWithinSweepArc(
        originX,
        originY,
        directionX,
        directionY,
        maxDistance,
        minDot,
        point.x,
        point.y,
      ),
    )
  ) {
    return true;
  }

  for (const [start, end] of getResolvedRectEdges(rect)) {
    if (
      doesSegmentIntersectSweepArc(
        originX,
        originY,
        aimAngle,
        halfArcRadians,
        maxDistance,
        start,
        end,
      )
    ) {
      return true;
    }
  }

  return false;
}

function getSweptResolvedRectIntersectionTime(
  movingRect: ResolvedHitboxRect,
  deltaX: number,
  deltaY: number,
  targetRect: ResolvedHitboxRect,
  maxTime = 1,
): number | null {
  let entryTime = 0;
  let exitTime = maxTime;

  const xResult = updateAxisSweepIntersection(
    movingRect.centerX,
    deltaX,
    targetRect.minX - movingRect.width / 2,
    targetRect.maxX + movingRect.width / 2,
    entryTime,
    exitTime,
    maxTime,
  );
  if (!xResult) {
    return null;
  }
  entryTime = xResult.entryTime;
  exitTime = xResult.exitTime;

  const yResult = updateAxisSweepIntersection(
    movingRect.centerY,
    deltaY,
    targetRect.minY - movingRect.height / 2,
    targetRect.maxY + movingRect.height / 2,
    entryTime,
    exitTime,
    maxTime,
  );
  if (!yResult) {
    return null;
  }

  return yResult.entryTime;
}

export function getSweptResolvedRectSetIntersectionTime(
  movingRects: readonly ResolvedHitboxRect[],
  deltaX: number,
  deltaY: number,
  targetRects: readonly ResolvedHitboxRect[],
  maxTime = 1,
): number | null {
  let bestHitTime: number | null = null;

  for (const movingRect of movingRects) {
    for (const targetRect of targetRects) {
      const hitTime = getSweptResolvedRectIntersectionTime(
        movingRect,
        deltaX,
        deltaY,
        targetRect,
        maxTime,
      );
      if (hitTime === null) {
        continue;
      }
      if (bestHitTime === null || hitTime < bestHitTime) {
        bestHitTime = hitTime;
      }
    }
  }

  return bestHitTime;
}

function overlapsRectAndOrientedBoxOnAxis(
  deltaX: number,
  deltaY: number,
  axisX: number,
  axisY: number,
  rectHalfWidth: number,
  rectHalfHeight: number,
  halfLength: number,
  halfWidth: number,
  forwardX: number,
  forwardY: number,
  perpendicularX: number,
  perpendicularY: number,
): boolean {
  const distance = Math.abs(deltaX * axisX + deltaY * axisY);
  const rectRadius =
    rectHalfWidth * Math.abs(axisX) + rectHalfHeight * Math.abs(axisY);
  const attackRadius =
    halfLength * Math.abs(forwardX * axisX + forwardY * axisY) +
    halfWidth * Math.abs(perpendicularX * axisX + perpendicularY * axisY);

  return distance <= rectRadius + attackRadius;
}

function isPointInsideResolvedRect(
  rect: ResolvedHitboxRect,
  x: number,
  y: number,
): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

function getResolvedRectSamplePoints(rect: ResolvedHitboxRect): Point2D[] {
  return [
    { x: rect.centerX, y: rect.centerY },
    { x: rect.minX, y: rect.minY },
    { x: rect.minX, y: rect.maxY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.centerX, y: rect.minY },
    { x: rect.centerX, y: rect.maxY },
    { x: rect.minX, y: rect.centerY },
    { x: rect.maxX, y: rect.centerY },
  ];
}

function getResolvedRectEdges(
  rect: ResolvedHitboxRect,
): readonly (readonly [Point2D, Point2D])[] {
  return [
    [
      { x: rect.minX, y: rect.minY },
      { x: rect.maxX, y: rect.minY },
    ],
    [
      { x: rect.maxX, y: rect.minY },
      { x: rect.maxX, y: rect.maxY },
    ],
    [
      { x: rect.maxX, y: rect.maxY },
      { x: rect.minX, y: rect.maxY },
    ],
    [
      { x: rect.minX, y: rect.maxY },
      { x: rect.minX, y: rect.minY },
    ],
  ] as const;
}

function isPointWithinSweepArc(
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  maxDistance: number,
  minDot: number,
  pointX: number,
  pointY: number,
): boolean {
  const deltaX = pointX - originX;
  const deltaY = pointY - originY;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance > maxDistance) {
    return false;
  }
  if (distance <= Number.EPSILON) {
    return true;
  }

  const dot = (deltaX * directionX + deltaY * directionY) / distance;
  return dot >= minDot;
}

function getPerpendicularAxis(directionX: number, directionY: number): Point2D {
  return {
    x: -directionY,
    y: directionX,
  };
}

function doesSegmentIntersectSweepArc(
  originX: number,
  originY: number,
  aimAngle: number,
  halfArcRadians: number,
  maxDistance: number,
  start: Point2D,
  end: Point2D,
): boolean {
  const clippedSegment = clipSegmentToCircle(
    originX,
    originY,
    maxDistance,
    start,
    end,
  );
  if (!clippedSegment) {
    return false;
  }

  const startAngle = Math.atan2(
    clippedSegment.start.y - originY,
    clippedSegment.start.x - originX,
  );
  const endAngle = Math.atan2(
    clippedSegment.end.y - originY,
    clippedSegment.end.x - originX,
  );
  const startDelta = normalizeAngle(startAngle - aimAngle);
  const endDelta = unwrapAngleToReference(endAngle - aimAngle, startDelta);
  const minDelta = Math.min(startDelta, endDelta);
  const maxDelta = Math.max(startDelta, endDelta);

  return maxDelta >= -halfArcRadians && minDelta <= halfArcRadians;
}

function clipSegmentToCircle(
  originX: number,
  originY: number,
  radius: number,
  start: Point2D,
  end: Point2D,
): Segment2D | null {
  const relativeStartX = start.x - originX;
  const relativeStartY = start.y - originY;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const radiusSq = radius * radius;
  const startInside =
    relativeStartX * relativeStartX + relativeStartY * relativeStartY <=
    radiusSq;
  const relativeEndX = end.x - originX;
  const relativeEndY = end.y - originY;
  const endInside =
    relativeEndX * relativeEndX + relativeEndY * relativeEndY <= radiusSq;

  if (startInside && endInside) {
    return { start, end };
  }

  const a = deltaX * deltaX + deltaY * deltaY;
  if (a <= Number.EPSILON) {
    return startInside ? { start, end } : null;
  }

  const b = 2 * (relativeStartX * deltaX + relativeStartY * deltaY);
  const c =
    relativeStartX * relativeStartX +
    relativeStartY * relativeStartY -
    radiusSq;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return null;
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const firstT = (-b - sqrtDiscriminant) / (2 * a);
  const secondT = (-b + sqrtDiscriminant) / (2 * a);
  const clippedStartT = startInside ? 0 : Math.max(0, firstT);
  const clippedEndT = endInside ? 1 : Math.min(1, secondT);
  if (clippedStartT > clippedEndT) {
    return null;
  }

  return {
    start: {
      x: start.x + deltaX * clippedStartT,
      y: start.y + deltaY * clippedStartT,
    },
    end: {
      x: start.x + deltaX * clippedEndT,
      y: start.y + deltaY * clippedEndT,
    },
  };
}

function normalizeAngle(angle: number): number {
  let normalizedAngle = angle;
  while (normalizedAngle <= -Math.PI) {
    normalizedAngle += Math.PI * 2;
  }
  while (normalizedAngle > Math.PI) {
    normalizedAngle -= Math.PI * 2;
  }
  return normalizedAngle;
}

function unwrapAngleToReference(angle: number, reference: number): number {
  let unwrappedAngle = normalizeAngle(angle);
  while (unwrappedAngle - reference <= -Math.PI) {
    unwrappedAngle += Math.PI * 2;
  }
  while (unwrappedAngle - reference > Math.PI) {
    unwrappedAngle -= Math.PI * 2;
  }
  return unwrappedAngle;
}

function updateAxisSweepIntersection(
  origin: number,
  delta: number,
  min: number,
  max: number,
  currentEntryTime: number,
  currentExitTime: number,
  maxTime: number,
): { entryTime: number; exitTime: number } | null {
  if (Math.abs(delta) < Number.EPSILON) {
    if (origin < min || origin > max) {
      return null;
    }
    return {
      entryTime: currentEntryTime,
      exitTime: currentExitTime,
    };
  }

  const inverseDelta = 1 / delta;
  let axisEntryTime = (min - origin) * inverseDelta;
  let axisExitTime = (max - origin) * inverseDelta;

  if (axisEntryTime > axisExitTime) {
    [axisEntryTime, axisExitTime] = [axisExitTime, axisEntryTime];
  }

  const entryTime = Math.max(currentEntryTime, axisEntryTime);
  const exitTime = Math.min(currentExitTime, axisExitTime);
  if (entryTime > exitTime || exitTime < 0 || entryTime > maxTime) {
    return null;
  }

  return {
    entryTime,
    exitTime,
  };
}
