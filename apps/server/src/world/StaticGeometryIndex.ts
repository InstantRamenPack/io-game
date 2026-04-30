import type {
  HitboxBounds,
  ResolvedHitboxRect,
} from "@shared/geometry/hitbox.ts";
import type { Entity } from "@server/entities/Entity.ts";

export type StaticGeometryBlocker = {
  entity: Entity;
  entityId: number;
  bounds: HitboxBounds;
  hitboxes: readonly ResolvedHitboxRect[];
};

type CellSpan = {
  minCellX: number;
  maxCellX: number;
  minCellY: number;
  maxCellY: number;
};

const CELL_KEY_OFFSET = 1 << 15;
const CELL_KEY_STRIDE = 1 << 16;

/**
 * Authoritative server-side index for solid static geometry.
 *
 * Movement collision, pathfinding, combat occlusion, and server placement all
 * consume these blockers so they agree on the same solid rectangles.
 */
export class StaticGeometryIndex {
  private readonly cellSize: number;
  private readonly buckets = new Map<number, StaticGeometryBlocker[]>();
  private readonly blockerByEntityId = new Map<number, StaticGeometryBlocker>();
  private readonly cellSpanByEntityId = new Map<number, CellSpan>();
  private readonly cellKeysByEntityId = new Map<number, number[]>();
  private readonly syncedEntityIds = new Map<number, number>();
  private readonly visitedEntityIds = new Map<number, number>();
  private syncMarker = 0;
  private queryMarker = 0;

  constructor(cellSize = 64) {
    this.cellSize = cellSize;
  }

  public sync(entities: readonly Entity[]): void {
    this.syncMarker += 1;
    if (this.syncMarker >= Number.MAX_SAFE_INTEGER) {
      this.syncMarker = 1;
      this.syncedEntityIds.clear();
    }

    for (const entity of entities) {
      if (!isStaticGeometryEntity(entity)) {
        continue;
      }
      this.syncedEntityIds.set(entity.id, this.syncMarker);
      this.upsert(entity);
    }

    for (const entityId of [...this.blockerByEntityId.keys()]) {
      if (this.syncedEntityIds.get(entityId) === this.syncMarker) {
        continue;
      }
      this.removeEntity(entityId);
    }
  }

  public queryBox(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    result: StaticGeometryBlocker[] = [],
  ): StaticGeometryBlocker[] {
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
        for (const blocker of bucket) {
          if (
            this.visitedEntityIds.get(blocker.entityId) === this.queryMarker
          ) {
            continue;
          }
          this.visitedEntityIds.set(blocker.entityId, this.queryMarker);
          result.push(blocker);
        }
      }
    }

    result.sort((left, right) => left.entityId - right.entityId);
    return result;
  }

  public isBlocker(entity: Entity): boolean {
    return this.blockerByEntityId.has(entity.id);
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
    const previousBlocker = this.blockerByEntityId.get(entity.id);
    if (
      previousBlocker?.entity === entity &&
      previousSpan &&
      spansMatch(previousSpan, nextSpan)
    ) {
      previousBlocker.bounds = bounds;
      previousBlocker.hitboxes = entity.getWorldHitboxes();
      return;
    }

    const previousKeys = this.cellKeysByEntityId.get(entity.id);
    if (previousKeys) {
      this.removeFromBuckets(entity.id, previousKeys);
    }

    const blocker: StaticGeometryBlocker = {
      entity,
      entityId: entity.id,
      bounds,
      hitboxes: entity.getWorldHitboxes(),
    };
    const nextKeys = this.makeCellKeys(nextSpan);
    for (const key of nextKeys) {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = [];
        this.buckets.set(key, bucket);
      }
      bucket.push(blocker);
    }

    this.blockerByEntityId.set(entity.id, blocker);
    this.cellSpanByEntityId.set(entity.id, nextSpan);
    this.cellKeysByEntityId.set(entity.id, nextKeys);
  }

  private removeEntity(entityId: number): void {
    const keys = this.cellKeysByEntityId.get(entityId);
    if (keys) {
      this.removeFromBuckets(entityId, keys);
    }
    this.blockerByEntityId.delete(entityId);
    this.cellSpanByEntityId.delete(entityId);
    this.cellKeysByEntityId.delete(entityId);
  }

  private removeFromBuckets(entityId: number, keys: readonly number[]): void {
    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (!bucket) {
        continue;
      }
      const index = bucket.findIndex(
        (blocker) => blocker.entityId === entityId,
      );
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

export function isStaticGeometryEntity(entity: Entity): boolean {
  return entity.alive && entity.collisionMode === "static";
}

function spansMatch(left: CellSpan, right: CellSpan): boolean {
  return (
    left.minCellX === right.minCellX &&
    left.maxCellX === right.maxCellX &&
    left.minCellY === right.minCellY &&
    left.maxCellY === right.maxCellY
  );
}
