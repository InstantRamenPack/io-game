import type { Entity } from "@server/entities/Entity.ts";
import type { StaticGeometryBlocker } from "@server/world/StaticGeometryIndex.ts";
import type { World } from "@server/world/World.ts";

type TilePoint = { x: number; y: number };
type TileRect = { minX: number; minY: number; maxX: number; maxY: number };
type CachedPath = { points: readonly TilePoint[]; bounds: TileRect };
type OpenHeapEntry = { node: number; score: number };
type PathCacheKey = number;
export type NavPathBenchmarkStats = {
  requests: number;
  cacheHits: number;
  pathSearches: number;
  failedSearches: number;
  searchedNodes: number;
  searchMs: number;
  dirtyUpdateMs: number;
  dirtyRectsProcessed: number;
};

const PATH_TILE_SIZE = 1;
const PATHFIND_MAX_ITERATIONS = 200_000;
const PATH_CACHE_MAX_ENTRIES = 2_048;
const WAYPOINT_LOOKAHEAD_DISTANCE = 48;
const PATH_HEURISTIC_WEIGHT = 3;
const NEIGHBORS: ReadonlyArray<{ dx: number; dy: number; cost: number }> = [
  { dx: 1, dy: 0, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: Math.SQRT2 },
  { dx: 1, dy: -1, cost: Math.SQRT2 },
  { dx: -1, dy: 1, cost: Math.SQRT2 },
  { dx: -1, dy: -1, cost: Math.SQRT2 },
];

export class NavGridPathService {
  public benchmarkEnabled = false;
  private static readonly NODE_STATE_UNSEEN = 0;
  private static readonly NODE_STATE_OPEN = 1;
  private static readonly NODE_STATE_CLOSED = 2;
  private readonly tileSize = PATH_TILE_SIZE;
  private readonly widthTiles: number;
  private readonly heightTiles: number;
  private readonly occupancy = new Set<number>();
  private readonly dirtyRects: TileRect[] = [];
  private readonly openHeapNodes: number[] = [];
  private readonly openHeapScores: number[] = [];
  private readonly gScore = new Map<number, number>();
  private readonly fScore = new Map<number, number>();
  private readonly cameFrom = new Map<number, number>();
  private readonly nodeState = new Map<number, number>();
  private readonly queryBuffer: StaticGeometryBlocker[] = [];
  private readonly pathCache = new Map<PathCacheKey, CachedPath>();
  private readonly benchmarkStats: NavPathBenchmarkStats = {
    requests: 0,
    cacheHits: 0,
    pathSearches: 0,
    failedSearches: 0,
    searchedNodes: 0,
    searchMs: 0,
    dirtyUpdateMs: 0,
    dirtyRectsProcessed: 0,
  };

  constructor(worldSize: { w: number; h: number }) {
    this.widthTiles = Math.max(1, Math.ceil(worldSize.w / this.tileSize));
    this.heightTiles = Math.max(1, Math.ceil(worldSize.h / this.tileSize));
    this.markDirty({
      minX: 0,
      minY: 0,
      maxX: this.widthTiles - 1,
      maxY: this.heightTiles - 1,
    });
  }

  public markEntityDirty(entity: Entity): void {
    if (!isStaticNavBlocker(entity)) {
      return;
    }

    this.markDirty(this.worldBoundsToTileRect(entity.getWorldBounds()));
  }

  public updateDirty(world: World): void {
    if (this.dirtyRects.length === 0) {
      return;
    }

    const startedAt = this.benchmarkEnabled ? performance.now() : 0;
    const merged = mergeTileRects(
      this.dirtyRects,
      this.widthTiles,
      this.heightTiles,
    );
    if (this.benchmarkEnabled) {
      this.benchmarkStats.dirtyRectsProcessed += merged.length;
    }
    this.dirtyRects.length = 0;

    for (const rect of merged) {
      this.clearRect(rect);
      const worldRect = this.tileRectToWorldBounds(rect);
      const candidates = world.staticGeometry.queryBox(
        worldRect.minX,
        worldRect.minY,
        worldRect.maxX,
        worldRect.maxY,
        this.queryBuffer,
      );

      for (const candidate of candidates) {
        this.rasterizeBlocker(candidate);
      }

      this.invalidateCacheForRect(rect);
    }
    if (this.benchmarkEnabled) {
      this.benchmarkStats.dirtyUpdateMs += performance.now() - startedAt;
    }
  }

  public getNextWaypoint(
    fromX: number,
    fromY: number,
    targetX: number,
    targetY: number,
  ): { x: number; y: number } | null {
    if (this.benchmarkEnabled) {
      this.benchmarkStats.requests += 1;
    }
    const requestedStart = this.worldPointToTile(fromX, fromY);
    const fromTile = this.findClosestWalkableTile(requestedStart);
    if (!fromTile) {
      return null;
    }
    const requestedTarget = this.worldPointToTile(targetX, targetY);
    const targetTile = this.findClosestWalkableTile(requestedTarget);
    if (!targetTile) {
      return null;
    }

    const fromIndex = this.tileToIndex(fromTile.x, fromTile.y);
    const targetIndex = this.tileToIndex(targetTile.x, targetTile.y);
    if (this.isDirectTilePathWalkable(fromTile, targetTile)) {
      return { x: targetX, y: targetY };
    }

    const cacheKey = this.makePathKey(fromIndex, targetIndex);
    const cached = this.pathCache.get(cacheKey);
    if (cached) {
      if (this.benchmarkEnabled) {
        this.benchmarkStats.cacheHits += 1;
      }
      this.pathCache.delete(cacheKey);
      this.pathCache.set(cacheKey, cached);
    }
    const path =
      cached?.points ??
      this.findPath(fromTile, targetTile, fromIndex, targetIndex);
    if (!path) {
      return null;
    }
    if (path.length < 2) {
      return { x: targetX, y: targetY };
    }

    if (!cached) {
      this.storePathInCache(cacheKey, {
        points: path,
        bounds: computeTilePathBounds(path),
      });
    }

    const next = this.resolveLookaheadWaypoint(path, fromX, fromY);
    if (!next) {
      return { x: targetX, y: targetY };
    }

    return this.tilePointToWorldCenter(next);
  }

  public getClosestWalkableWorldPoint(
    x: number,
    y: number,
  ): {
    x: number;
    y: number;
  } | null {
    const tile = this.findClosestWalkableTile(this.worldPointToTile(x, y));
    if (!tile) {
      return null;
    }
    return this.tilePointToWorldCenter(tile);
  }

  public collectAndResetBenchmarkStats(): NavPathBenchmarkStats {
    const stats = { ...this.benchmarkStats };
    this.benchmarkStats.requests = 0;
    this.benchmarkStats.cacheHits = 0;
    this.benchmarkStats.pathSearches = 0;
    this.benchmarkStats.failedSearches = 0;
    this.benchmarkStats.searchedNodes = 0;
    this.benchmarkStats.searchMs = 0;
    this.benchmarkStats.dirtyUpdateMs = 0;
    this.benchmarkStats.dirtyRectsProcessed = 0;
    return stats;
  }

  private resolveLookaheadWaypoint(
    path: readonly TilePoint[],
    fromX: number,
    fromY: number,
  ): TilePoint | null {
    let previous = { x: fromX, y: fromY };
    let traveled = 0;
    for (let index = 1; index < path.length; index += 1) {
      const point = path[index];
      if (!point) {
        continue;
      }
      const center = this.tilePointToWorldCenter(point);
      traveled += Math.hypot(center.x - previous.x, center.y - previous.y);
      if (traveled >= WAYPOINT_LOOKAHEAD_DISTANCE) {
        return point;
      }
      previous = center;
    }
    return path[path.length - 1] ?? null;
  }

  private tilePointToWorldCenter(point: TilePoint): { x: number; y: number } {
    return {
      x: point.x * this.tileSize + this.tileSize / 2,
      y: point.y * this.tileSize + this.tileSize / 2,
    };
  }

  public toTileCoordinate(x: number, y: number): TilePoint {
    return this.worldPointToTile(x, y);
  }

  private findPath(
    start: TilePoint,
    goal: TilePoint,
    startIndex = this.tileToIndex(start.x, start.y),
    goalIndex = this.tileToIndex(goal.x, goal.y),
  ): readonly TilePoint[] | null {
    const startedAt = this.benchmarkEnabled ? performance.now() : 0;
    if (this.benchmarkEnabled) {
      this.benchmarkStats.pathSearches += 1;
    }
    this.beginSearch();
    if (startIndex === goalIndex) {
      return [start];
    }

    this.resetOpenHeap();
    this.touchNode(startIndex);
    this.gScore.set(startIndex, 0);
    const startFScore =
      octileDistance(start.x, start.y, goal.x, goal.y) * PATH_HEURISTIC_WEIGHT;
    this.fScore.set(startIndex, startFScore);
    this.cameFrom.set(startIndex, -1);
    this.nodeState.set(startIndex, NavGridPathService.NODE_STATE_OPEN);
    this.pushOpenHeap(startIndex, startFScore);

    let iterations = 0;
    while (
      this.openHeapNodes.length > 0 &&
      iterations < PATHFIND_MAX_ITERATIONS
    ) {
      iterations += 1;
      const currentOpen = this.popOpenHeap();
      if (!currentOpen) {
        continue;
      }
      const current = currentOpen.node;
      if (this.nodeState.get(current) !== NavGridPathService.NODE_STATE_OPEN) {
        continue;
      }
      if (
        currentOpen.score >
        (this.fScore.get(current) ?? Number.POSITIVE_INFINITY)
      ) {
        continue;
      }
      this.nodeState.set(current, NavGridPathService.NODE_STATE_CLOSED);

      if (current === goalIndex) {
        if (this.benchmarkEnabled) {
          this.benchmarkStats.searchedNodes += iterations;
          this.benchmarkStats.searchMs += performance.now() - startedAt;
        }
        return reconstructPath(this.cameFrom, current, this.widthTiles);
      }

      const currentX = current % this.widthTiles;
      const currentY = Math.floor(current / this.widthTiles);

      for (const neighbor of NEIGHBORS) {
        const nextX = currentX + neighbor.dx;
        const nextY = currentY + neighbor.dy;
        if (!this.isTileInBounds(nextX, nextY)) {
          continue;
        }
        if (!this.isTileWalkable(nextX, nextY)) {
          continue;
        }
        if (
          neighbor.dx !== 0 &&
          neighbor.dy !== 0 &&
          (!this.isTileWalkable(currentX + neighbor.dx, currentY) ||
            !this.isTileWalkable(currentX, currentY + neighbor.dy))
        ) {
          continue;
        }

        const nextIndex = this.tileToIndex(nextX, nextY);
        this.touchNode(nextIndex);
        if (
          this.nodeState.get(nextIndex) === NavGridPathService.NODE_STATE_CLOSED
        ) {
          continue;
        }

        const currentScore =
          this.gScore.get(current) ?? Number.POSITIVE_INFINITY;
        const nextScore =
          this.gScore.get(nextIndex) ?? Number.POSITIVE_INFINITY;
        const tentative = currentScore + neighbor.cost;
        if (tentative >= nextScore) {
          continue;
        }

        this.cameFrom.set(nextIndex, current);
        this.gScore.set(nextIndex, tentative);
        const nextFScore =
          tentative +
          octileDistance(nextX, nextY, goal.x, goal.y) * PATH_HEURISTIC_WEIGHT;
        this.fScore.set(nextIndex, nextFScore);
        this.nodeState.set(nextIndex, NavGridPathService.NODE_STATE_OPEN);
        this.pushOpenHeap(nextIndex, nextFScore);
      }
    }

    if (this.benchmarkEnabled) {
      this.benchmarkStats.failedSearches += 1;
      this.benchmarkStats.searchedNodes += iterations;
      this.benchmarkStats.searchMs += performance.now() - startedAt;
    }
    return null;
  }

  private beginSearch(): void {
    this.gScore.clear();
    this.fScore.clear();
    this.cameFrom.clear();
    this.nodeState.clear();
  }

  private touchNode(nodeIndex: number): void {
    if (this.nodeState.has(nodeIndex)) {
      return;
    }
    this.gScore.set(nodeIndex, Number.POSITIVE_INFINITY);
    this.fScore.set(nodeIndex, Number.POSITIVE_INFINITY);
    this.cameFrom.set(nodeIndex, -1);
    this.nodeState.set(nodeIndex, NavGridPathService.NODE_STATE_UNSEEN);
  }

  private resetOpenHeap(): void {
    this.openHeapNodes.length = 0;
    this.openHeapScores.length = 0;
  }

  private pushOpenHeap(node: number, score: number): void {
    this.openHeapNodes.push(node);
    this.openHeapScores.push(score);
    let index = this.openHeapNodes.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parentScore = this.openHeapScores[parentIndex];
      if (
        parentScore === undefined ||
        parentScore <= (this.openHeapScores[index] ?? Number.POSITIVE_INFINITY)
      ) {
        break;
      }
      this.swapOpenHeapEntries(index, parentIndex);
      index = parentIndex;
    }
  }

  private popOpenHeap(): OpenHeapEntry | null {
    const lastIndex = this.openHeapNodes.length - 1;
    if (lastIndex < 0) {
      return null;
    }

    const rootNode = this.openHeapNodes[0];
    const rootScore = this.openHeapScores[0];
    if (rootNode === undefined || rootScore === undefined) {
      this.resetOpenHeap();
      return null;
    }

    const tailNode = this.openHeapNodes[lastIndex];
    const tailScore = this.openHeapScores[lastIndex];
    this.openHeapNodes.pop();
    this.openHeapScores.pop();
    if (
      this.openHeapNodes.length > 0 &&
      tailNode !== undefined &&
      tailScore !== undefined
    ) {
      this.openHeapNodes[0] = tailNode;
      this.openHeapScores[0] = tailScore;
      this.heapifyDown(0);
    }
    return { node: rootNode, score: rootScore };
  }

  private heapifyDown(startIndex: number): void {
    let index = startIndex;
    while (true) {
      const leftChild = index * 2 + 1;
      const rightChild = leftChild + 1;
      let smallest = index;

      const smallestScore =
        this.openHeapScores[smallest] ?? Number.POSITIVE_INFINITY;
      const leftScore =
        this.openHeapScores[leftChild] ?? Number.POSITIVE_INFINITY;
      if (leftScore < smallestScore) {
        smallest = leftChild;
      }

      const nextSmallestScore =
        this.openHeapScores[smallest] ?? Number.POSITIVE_INFINITY;
      const rightScore =
        this.openHeapScores[rightChild] ?? Number.POSITIVE_INFINITY;
      if (rightScore < nextSmallestScore) {
        smallest = rightChild;
      }

      if (smallest === index) {
        return;
      }

      this.swapOpenHeapEntries(index, smallest);
      index = smallest;
    }
  }

  private swapOpenHeapEntries(left: number, right: number): void {
    const leftNode = this.openHeapNodes[left];
    const rightNode = this.openHeapNodes[right];
    const leftScore = this.openHeapScores[left];
    const rightScore = this.openHeapScores[right];
    if (
      leftNode === undefined ||
      rightNode === undefined ||
      leftScore === undefined ||
      rightScore === undefined
    ) {
      return;
    }
    this.openHeapNodes[left] = rightNode;
    this.openHeapNodes[right] = leftNode;
    this.openHeapScores[left] = rightScore;
    this.openHeapScores[right] = leftScore;
  }

  private findClosestWalkableTile(target: TilePoint): TilePoint | null {
    if (this.isTileWalkable(target.x, target.y)) {
      return target;
    }

    for (let radius = 1; radius <= 8; radius += 1) {
      for (let y = target.y - radius; y <= target.y + radius; y += 1) {
        for (let x = target.x - radius; x <= target.x + radius; x += 1) {
          if (!this.isTileInBounds(x, y)) {
            continue;
          }
          if (!this.isTileWalkable(x, y)) {
            continue;
          }
          return { x, y };
        }
      }
    }

    return null;
  }

  private rasterizeBlocker(blocker: StaticGeometryBlocker): void {
    for (const hitbox of blocker.hitboxes) {
      const rect = this.worldBoundsToTileRect(hitbox);
      for (let y = rect.minY; y <= rect.maxY; y += 1) {
        for (let x = rect.minX; x <= rect.maxX; x += 1) {
          this.occupancy.add(this.tileToIndex(x, y));
        }
      }
    }
  }

  private clearRect(rect: TileRect): void {
    for (let y = rect.minY; y <= rect.maxY; y += 1) {
      for (let x = rect.minX; x <= rect.maxX; x += 1) {
        this.occupancy.delete(this.tileToIndex(x, y));
      }
    }
  }

  private invalidateCacheForRect(rect: TileRect): void {
    for (const [key, path] of this.pathCache.entries()) {
      if (doTileRectsOverlap(path.bounds, rect)) {
        this.pathCache.delete(key);
      }
    }
  }

  private markDirty(rect: TileRect): void {
    this.dirtyRects.push(
      clampTileRect(rect, this.widthTiles, this.heightTiles),
    );
  }

  private worldPointToTile(x: number, y: number): TilePoint {
    return {
      x: clamp(Math.floor(x / this.tileSize), 0, this.widthTiles - 1),
      y: clamp(Math.floor(y / this.tileSize), 0, this.heightTiles - 1),
    };
  }

  private worldBoundsToTileRect(bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): TileRect {
    return {
      minX: clamp(
        Math.floor(bounds.minX / this.tileSize),
        0,
        this.widthTiles - 1,
      ),
      minY: clamp(
        Math.floor(bounds.minY / this.tileSize),
        0,
        this.heightTiles - 1,
      ),
      maxX: clamp(
        Math.floor((bounds.maxX - 0.001) / this.tileSize),
        0,
        this.widthTiles - 1,
      ),
      maxY: clamp(
        Math.floor((bounds.maxY - 0.001) / this.tileSize),
        0,
        this.heightTiles - 1,
      ),
    };
  }

  private tileRectToWorldBounds(rect: TileRect): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    return {
      minX: rect.minX * this.tileSize,
      minY: rect.minY * this.tileSize,
      maxX: (rect.maxX + 1) * this.tileSize,
      maxY: (rect.maxY + 1) * this.tileSize,
    };
  }

  private tileToIndex(x: number, y: number): number {
    return y * this.widthTiles + x;
  }

  private isTileInBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.widthTiles && y < this.heightTiles;
  }

  private isTileWalkable(x: number, y: number): boolean {
    return (
      this.isTileInBounds(x, y) && !this.occupancy.has(this.tileToIndex(x, y))
    );
  }

  private isDirectTilePathWalkable(
    from: TilePoint,
    target: TilePoint,
  ): boolean {
    let x = from.x;
    let y = from.y;
    const deltaX = Math.abs(target.x - x);
    const deltaY = Math.abs(target.y - y);
    const stepX = x < target.x ? 1 : -1;
    const stepY = y < target.y ? 1 : -1;
    let error = deltaX - deltaY;

    if (!this.isTileWalkable(x, y)) {
      return false;
    }

    while (x !== target.x || y !== target.y) {
      const previousX = x;
      const previousY = y;
      const doubledError = error * 2;
      if (doubledError > -deltaY) {
        error -= deltaY;
        x += stepX;
      }
      if (doubledError < deltaX) {
        error += deltaX;
        y += stepY;
      }

      if (!this.isTileWalkable(x, y)) {
        return false;
      }
      if (
        x !== previousX &&
        y !== previousY &&
        (!this.isTileWalkable(x, previousY) ||
          !this.isTileWalkable(previousX, y))
      ) {
        return false;
      }
    }

    return true;
  }

  private makePathKey(startIndex: number, goalIndex: number): PathCacheKey {
    return startIndex * (this.widthTiles * this.heightTiles) + goalIndex;
  }

  private storePathInCache(key: PathCacheKey, path: CachedPath): void {
    if (this.pathCache.size >= PATH_CACHE_MAX_ENTRIES) {
      const oldestKey = this.pathCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.pathCache.delete(oldestKey);
      }
    }
    this.pathCache.set(key, path);
  }
}

function isStaticNavBlocker(entity: Entity): boolean {
  return entity.alive && entity.collisionMode === "static";
}

function reconstructPath(
  cameFrom: ReadonlyMap<number, number>,
  current: number,
  widthTiles: number,
): TilePoint[] {
  const path: TilePoint[] = [];
  let cursor = current;
  while (cursor >= 0) {
    path.push({ x: cursor % widthTiles, y: Math.floor(cursor / widthTiles) });
    cursor = cameFrom.get(cursor) ?? -1;
  }
  path.reverse();
  return path;
}

function octileDistance(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number {
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  const diagonal = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonal;
  return diagonal * Math.SQRT2 + straight;
}

function computeTilePathBounds(path: readonly TilePoint[]): TileRect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of path) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    minX: Number.isFinite(minX) ? minX : 0,
    minY: Number.isFinite(minY) ? minY : 0,
    maxX: Number.isFinite(maxX) ? maxX : 0,
    maxY: Number.isFinite(maxY) ? maxY : 0,
  };
}

function doTileRectsOverlap(left: TileRect, right: TileRect): boolean {
  return !(
    left.maxX < right.minX ||
    left.minX > right.maxX ||
    left.maxY < right.minY ||
    left.minY > right.maxY
  );
}

function mergeTileRects(
  rects: readonly TileRect[],
  widthTiles: number,
  heightTiles: number,
): TileRect[] {
  const merged: TileRect[] = [];

  for (const rect of rects) {
    let next = clampTileRect(rect, widthTiles, heightTiles);
    let hasMerged = true;
    while (hasMerged) {
      hasMerged = false;
      for (let index = 0; index < merged.length; index += 1) {
        const existing = merged[index];
        if (
          !existing ||
          !doTileRectsOverlap(next, expandTileRect(existing, 1))
        ) {
          continue;
        }
        next = {
          minX: Math.min(next.minX, existing.minX),
          minY: Math.min(next.minY, existing.minY),
          maxX: Math.max(next.maxX, existing.maxX),
          maxY: Math.max(next.maxY, existing.maxY),
        };
        merged.splice(index, 1);
        hasMerged = true;
        break;
      }
    }
    merged.push(next);
  }

  return merged;
}

function expandTileRect(rect: TileRect, amount: number): TileRect {
  return {
    minX: rect.minX - amount,
    minY: rect.minY - amount,
    maxX: rect.maxX + amount,
    maxY: rect.maxY + amount,
  };
}

function clampTileRect(
  rect: TileRect,
  widthTiles: number,
  heightTiles: number,
): TileRect {
  return {
    minX: clamp(rect.minX, 0, widthTiles - 1),
    minY: clamp(rect.minY, 0, heightTiles - 1),
    maxX: clamp(rect.maxX, 0, widthTiles - 1),
    maxY: clamp(rect.maxY, 0, heightTiles - 1),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
