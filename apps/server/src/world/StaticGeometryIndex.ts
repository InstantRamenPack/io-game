import type {
  HitboxBounds,
  ResolvedHitboxRect,
} from "@shared/geometry/hitbox.ts";
import {
  GridIndex,
  gridCellSpansMatch,
  type GridCellSpan,
} from "@shared/spatial/GridIndex.ts";
import type { Entity } from "@server/entities/Entity.ts";

export type StaticGeometryBlocker = {
  entity: Entity;
  entityId: number;
  bounds: HitboxBounds;
  hitboxes: readonly ResolvedHitboxRect[];
};

/**
 * Authoritative server-side index for solid static geometry.
 *
 * Movement collision, pathfinding, combat occlusion, and server placement all
 * consume these blockers so they agree on the same solid rectangles.
 */
export class StaticGeometryIndex {
  private readonly grid: GridIndex<StaticGeometryBlocker>;
  private readonly blockerByEntityId = new Map<number, StaticGeometryBlocker>();
  private readonly cellSpanByEntityId = new Map<number, GridCellSpan>();
  private readonly cellKeysByEntityId = new Map<number, number[]>();
  private readonly syncedEntityIds = new Map<number, number>();
  private syncMarker = 0;

  constructor(cellSize = 64) {
    this.grid = new GridIndex<StaticGeometryBlocker>(cellSize);
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
    sortByEntityId = true,
  ): StaticGeometryBlocker[] {
    this.grid.queryBox(
      minX,
      minY,
      maxX,
      maxY,
      result,
      (blocker) => blocker.entityId,
    );

    if (sortByEntityId) {
      result.sort((left, right) => left.entityId - right.entityId);
    }
    return result;
  }

  public hasBlockers(): boolean {
    return this.blockerByEntityId.size > 0;
  }

  public isBlocker(entity: Entity): boolean {
    return this.blockerByEntityId.has(entity.id);
  }

  private upsert(entity: Entity): void {
    const bounds = entity.getWorldBounds();
    const nextSpan = this.grid.spanFromBounds(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    );
    const previousSpan = this.cellSpanByEntityId.get(entity.id);
    const previousBlocker = this.blockerByEntityId.get(entity.id);
    if (
      previousBlocker?.entity === entity &&
      previousSpan &&
      gridCellSpansMatch(previousSpan, nextSpan)
    ) {
      previousBlocker.bounds = bounds;
      previousBlocker.hitboxes = entity.getWorldHitboxes();
      return;
    }

    const previousKeys = this.cellKeysByEntityId.get(entity.id);
    if (previousKeys) {
      this.grid.removeFromCells(
        previousKeys,
        (blocker) => blocker.entityId === entity.id,
      );
    }

    const blocker: StaticGeometryBlocker = {
      entity,
      entityId: entity.id,
      bounds,
      hitboxes: entity.getWorldHitboxes(),
    };
    const nextKeys = this.grid.keysFromSpan(nextSpan);
    this.grid.addToCells(nextKeys, blocker);

    this.blockerByEntityId.set(entity.id, blocker);
    this.cellSpanByEntityId.set(entity.id, nextSpan);
    this.cellKeysByEntityId.set(entity.id, nextKeys);
  }

  private removeEntity(entityId: number): void {
    const keys = this.cellKeysByEntityId.get(entityId);
    if (keys) {
      this.grid.removeFromCells(
        keys,
        (blocker) => blocker.entityId === entityId,
      );
    }
    this.blockerByEntityId.delete(entityId);
    this.cellSpanByEntityId.delete(entityId);
    this.cellKeysByEntityId.delete(entityId);
  }
}

export function isStaticGeometryEntity(entity: Entity): boolean {
  return entity.alive && entity.collisionMode === "static";
}
