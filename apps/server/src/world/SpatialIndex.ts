import type { Entity } from "@server/entities/Entity.ts";
import {
  GridIndex,
  gridCellSpansMatch,
  type GridCellSpan,
} from "@shared/spatial/GridIndex.ts";

/**
 * Uniform-grid spatial index for broad-phase proximity queries.
 * Entities are inserted into every cell touched by their composite hitbox bounds.
 */
export class SpatialIndex {
  private readonly grid: GridIndex<Entity>;
  private readonly indexedEntityById = new Map<number, Entity>();
  private readonly cellSpanByEntityId = new Map<number, GridCellSpan>();
  private readonly cellKeysByEntityId = new Map<number, number[]>();
  private readonly syncedEntityIds = new Map<number, number>();
  private syncMarker = 0;

  /**
   * Creates a grid with the provided cell size in world units.
   * @param cellSize Uniform grid cell size.
   */
  constructor(cellSize = 64) {
    this.grid = new GridIndex<Entity>(cellSize);
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
    return this.grid.queryBox(minX, minY, maxX, maxY, result, (entity) =>
      entity.id,
    );
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
    const previousEntity = this.indexedEntityById.get(entity.id);
    if (
      previousEntity === entity &&
      previousSpan &&
      gridCellSpansMatch(previousSpan, nextSpan)
    ) {
      return;
    }

    const previousKeys = this.cellKeysByEntityId.get(entity.id);
    if (previousKeys) {
      this.grid.removeFromCells(
        previousKeys,
        (indexedEntity) => indexedEntity.id === entity.id,
      );
    }

    const nextKeys = this.grid.keysFromSpan(nextSpan);
    this.grid.addToCells(nextKeys, entity);

    this.indexedEntityById.set(entity.id, entity);
    this.cellSpanByEntityId.set(entity.id, nextSpan);
    this.cellKeysByEntityId.set(entity.id, nextKeys);
  }

  private removeEntity(entityId: number): void {
    const keys = this.cellKeysByEntityId.get(entityId);
    if (keys) {
      this.grid.removeFromCells(
        keys,
        (entity) => entity.id === entityId,
      );
    }
    this.indexedEntityById.delete(entityId);
    this.cellSpanByEntityId.delete(entityId);
    this.cellKeysByEntityId.delete(entityId);
  }
}
