import type { Entity } from "@server/entities/Entity.ts";

/**
 * Uniform-grid spatial index for broad-phase proximity queries.
 * Entities are inserted into every cell touched by their composite hitbox bounds.
 */
export class SpatialIndex {
  private readonly cellSize: number;
  private readonly buckets = new Map<number, Entity[]>();
  private readonly indexedEntityById = new Map<number, Entity>();
  private readonly cellSpanByEntityId = new Map<number, CellSpan>();
  private readonly cellKeysByEntityId = new Map<number, number[]>();
  private readonly syncedEntityIds = new Map<number, number>();
  private syncMarker = 0;
  private readonly visitedEntityIds = new Map<number, number>();
  private queryMarker = 0;

  /**
   * Creates a grid with the provided cell size in world units.
   * @param cellSize Uniform grid cell size.
   */
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
  }

  /**
   * Rebuilds the index from the current authoritative entity list.
   * @param entities Entities to index.
   */
  public rebuild(entities: Entity[]): void {
    this.sync(entities);
  }

  public sync(entities: readonly Entity[]): void {
    this.syncMarker += 1;
    if (this.syncMarker >= Number.MAX_SAFE_INTEGER) {
      this.syncMarker = 1;
      this.syncedEntityIds.clear();
    }

    for (const entity of entities) {
      this.syncedEntityIds.set(entity.id, this.syncMarker);
      this.upsert(entity);
    }

    for (const entityId of [...this.indexedEntityById.keys()]) {
      if (this.syncedEntityIds.get(entityId) === this.syncMarker) {
        continue;
      }
      this.removeEntity(entityId);
    }
  }

  /**
   * Returns entities whose indexed hitboxes touch cells overlapped by the query box.
   * @param minX Left query edge.
   * @param minY Top query edge.
   * @param maxX Right query edge.
   * @param maxY Bottom query edge.
   * @param result Optional output buffer reused by caller.
   * @returns Unique candidate entities from the covered cells.
   */
  public queryBox(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    result: Entity[] = [],
  ): Entity[] {
    result.length = 0;
    this.queryMarker += 1;
    if (this.queryMarker >= Number.MAX_SAFE_INTEGER) {
      this.queryMarker = 1;
      this.visitedEntityIds.clear();
    }

    const minCellX = this.toCell(minX);
    const maxCellX = this.toCell(maxX);
    const minCellY = this.toCell(minY);
    const maxCellY = this.toCell(maxY);

    for (let gridX = minCellX; gridX <= maxCellX; gridX += 1) {
      for (let gridY = minCellY; gridY <= maxCellY; gridY += 1) {
        const bucket = this.buckets.get(this.makeKey(gridX, gridY));
        if (!bucket) {
          continue;
        }
        for (const entity of bucket) {
          if (this.visitedEntityIds.get(entity.id) === this.queryMarker) {
            continue;
          }
          this.visitedEntityIds.set(entity.id, this.queryMarker);
          result.push(entity);
        }
      }
    }

    return result;
  }

  private upsert(entity: Entity): void {
    const bounds = entity.getWorldBounds();
    const nextSpan: CellSpan = {
      minCellX: this.toCell(bounds.minX),
      maxCellX: this.toCell(bounds.maxX),
      minCellY: this.toCell(bounds.minY),
      maxCellY: this.toCell(bounds.maxY),
    };
    const previousSpan = this.cellSpanByEntityId.get(entity.id);
    const previousEntity = this.indexedEntityById.get(entity.id);
    if (
      previousEntity === entity &&
      previousSpan &&
      spansMatch(previousSpan, nextSpan)
    ) {
      return;
    }

    const previousKeys = this.cellKeysByEntityId.get(entity.id);
    if (previousKeys) {
      this.removeFromBuckets(entity.id, previousKeys);
    }

    const nextKeys = this.makeCellKeys(nextSpan);
    for (const key of nextKeys) {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = [];
        this.buckets.set(key, bucket);
      }
      bucket.push(entity);
    }

    this.indexedEntityById.set(entity.id, entity);
    this.cellSpanByEntityId.set(entity.id, nextSpan);
    this.cellKeysByEntityId.set(entity.id, nextKeys);
  }

  private removeEntity(entityId: number): void {
    const keys = this.cellKeysByEntityId.get(entityId);
    if (keys) {
      this.removeFromBuckets(entityId, keys);
    }
    this.indexedEntityById.delete(entityId);
    this.cellSpanByEntityId.delete(entityId);
    this.cellKeysByEntityId.delete(entityId);
  }

  private removeFromBuckets(entityId: number, keys: readonly number[]): void {
    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (!bucket) {
        continue;
      }
      const index = bucket.findIndex((entity) => entity.id === entityId);
      if (index >= 0) {
        bucket.splice(index, 1);
      }
      if (bucket.length === 0) {
        this.buckets.delete(key);
      }
    }
  }

  private makeCellKeys(span: CellSpan): number[] {
    const keys: number[] = [];
    for (let gridX = span.minCellX; gridX <= span.maxCellX; gridX += 1) {
      for (let gridY = span.minCellY; gridY <= span.maxCellY; gridY += 1) {
        keys.push(this.makeKey(gridX, gridY));
      }
    }
    return keys;
  }

  private toCell(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  private makeKey(gridX: number, gridY: number): number {
    return (
      (gridX + CELL_KEY_OFFSET) * CELL_KEY_STRIDE + (gridY + CELL_KEY_OFFSET)
    );
  }
}

type CellSpan = {
  minCellX: number;
  maxCellX: number;
  minCellY: number;
  maxCellY: number;
};

function spansMatch(left: CellSpan, right: CellSpan): boolean {
  return (
    left.minCellX === right.minCellX &&
    left.maxCellX === right.maxCellX &&
    left.minCellY === right.minCellY &&
    left.maxCellY === right.maxCellY
  );
}

const CELL_KEY_OFFSET = 1 << 15;
const CELL_KEY_STRIDE = 1 << 16;
