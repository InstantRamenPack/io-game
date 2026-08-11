import type {
  HitboxBounds,
  ResolvedHitboxRect,
} from "@shared/geometry/hitbox.ts";
import { GridIndex } from "@shared/spatial/GridIndex.ts";
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
  private readonly syncedEntityIds = new Map<number, number>();
  private syncMarker = 0;

  constructor(cellSize = 64) {
    this.grid = new GridIndex<StaticGeometryBlocker>(cellSize);
  }

  public syncEntities(entities: readonly Entity[]): void {
    for (const entity of entities) {
      if (!isStaticGeometryEntity(entity)) {
        continue;
      }
      this.upsert(entity);
    }
  }

  public removeEntity(entityId: number): void {
    this.grid.remove(entityId);
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

    for (const entityId of [...this.grid.ids()]) {
      if (this.syncedEntityIds.get(entityId) === this.syncMarker) {
        continue;
      }
      this.grid.remove(entityId);
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
    return this.grid.size > 0;
  }

  public isBlocker(entity: Entity): boolean {
    return this.grid.get(entity.id)?.entity === entity;
  }

  private upsert(entity: Entity): void {
    const bounds = entity.getWorldBounds();
    let blocker = this.grid.get(entity.id);
    if (blocker?.entity === entity) {
      blocker.bounds = bounds;
      blocker.hitboxes = entity.getWorldHitboxes();
    } else {
      blocker = {
        entity,
        entityId: entity.id,
        bounds,
        hitboxes: entity.getWorldHitboxes(),
      };
    }
    this.grid.upsert(
      entity.id,
      blocker,
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    );
  }
}

export function isStaticGeometryEntity(entity: Entity): boolean {
  return entity.alive && entity.collisionMode === "static";
}
