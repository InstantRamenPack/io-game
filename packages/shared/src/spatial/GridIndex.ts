export const GRID_CELL_KEY_OFFSET = 1 << 15;
export const GRID_CELL_KEY_STRIDE = 1 << 16;

export type GridCellSpan = {
  minCellX: number;
  maxCellX: number;
  minCellY: number;
  maxCellY: number;
};

export function toGridCell(value: number, cellSize: number): number {
  return Math.floor(value / cellSize);
}

export function makeGridCellKey(cellX: number, cellY: number): number {
  return (
    (cellX + GRID_CELL_KEY_OFFSET) * GRID_CELL_KEY_STRIDE +
    (cellY + GRID_CELL_KEY_OFFSET)
  );
}

export function getGridCellSpanFromBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  cellSize: number,
): GridCellSpan {
  return {
    minCellX: toGridCell(minX, cellSize),
    maxCellX: toGridCell(maxX, cellSize),
    minCellY: toGridCell(minY, cellSize),
    maxCellY: toGridCell(maxY, cellSize),
  };
}

export function makeGridCellKeys(span: GridCellSpan): number[] {
  const keys: number[] = [];
  for (let gridX = span.minCellX; gridX <= span.maxCellX; gridX += 1) {
    for (let gridY = span.minCellY; gridY <= span.maxCellY; gridY += 1) {
      keys.push(makeGridCellKey(gridX, gridY));
    }
  }
  return keys;
}

export function gridCellSpansMatch(
  left: GridCellSpan,
  right: GridCellSpan,
): boolean {
  return (
    left.minCellX === right.minCellX &&
    left.maxCellX === right.maxCellX &&
    left.minCellY === right.minCellY &&
    left.maxCellY === right.maxCellY
  );
}

/**
 * Uniform-grid spatial index for broad-phase box queries.
 * Items are inserted into every cell touched by their query bounds.
 */
export class GridIndex<T> {
  private readonly cellSize: number;
  private readonly buckets = new Map<number, T[]>();
  private readonly visitedItemIds = new Map<number, number>();
  private queryMarker = 0;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  public getCellSize(): number {
    return this.cellSize;
  }

  public toCell(value: number): number {
    return toGridCell(value, this.cellSize);
  }

  public cellKey(cellX: number, cellY: number): number {
    return makeGridCellKey(cellX, cellY);
  }

  public spanFromBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): GridCellSpan {
    return getGridCellSpanFromBounds(minX, minY, maxX, maxY, this.cellSize);
  }

  public keysFromSpan(span: GridCellSpan): number[] {
    return makeGridCellKeys(span);
  }

  public addToCells(keys: readonly number[], item: T): void {
    for (const key of keys) {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = [];
        this.buckets.set(key, bucket);
      }
      bucket.push(item);
    }
  }

  public removeFromCells(
    keys: readonly number[],
    shouldRemove: (item: T) => boolean,
  ): void {
    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (!bucket) {
        continue;
      }
      const index = bucket.findIndex(shouldRemove);
      if (index >= 0) {
        bucket.splice(index, 1);
      }
      if (bucket.length === 0) {
        this.buckets.delete(key);
      }
    }
  }

  public queryBox(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    result: T[],
    getItemId: (item: T) => number,
  ): T[] {
    result.length = 0;
    this.queryMarker += 1;
    if (this.queryMarker >= Number.MAX_SAFE_INTEGER) {
      this.queryMarker = 1;
      this.visitedItemIds.clear();
    }

    const span = this.spanFromBounds(minX, minY, maxX, maxY);
    for (let gridX = span.minCellX; gridX <= span.maxCellX; gridX += 1) {
      for (let gridY = span.minCellY; gridY <= span.maxCellY; gridY += 1) {
        const bucket = this.buckets.get(this.cellKey(gridX, gridY));
        if (!bucket) {
          continue;
        }
        for (const item of bucket) {
          const itemId = getItemId(item);
          if (this.visitedItemIds.get(itemId) === this.queryMarker) {
            continue;
          }
          this.visitedItemIds.set(itemId, this.queryMarker);
          result.push(item);
        }
      }
    }

    return result;
  }

  public clear(): void {
    this.buckets.clear();
    this.visitedItemIds.clear();
    this.queryMarker = 0;
  }
}
