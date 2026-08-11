import type { Entity } from "@server/entities/Entity.ts";
import { GridIndex } from "@shared/spatial/GridIndex.ts";

/**
 * Uniform-grid spatial index for broad-phase proximity queries.
 * Entities are inserted into every cell touched by their composite hitbox bounds.
 */
export class SpatialIndex {
  private readonly grid: GridIndex<Entity>;
  private readonly boundsByEntityId = new Map<
    number,
    ReturnType<Entity["getWorldBounds"]>
  >();
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

    for (const entityId of [...this.grid.ids()]) {
      if (this.syncedEntityIds.get(entityId) === this.syncMarker) {
        continue;
      }
      this.removeEntity(entityId);
    }
  }

  public syncEntities(entities: readonly Entity[]): void {
    for (const entity of entities) {
      this.upsert(entity);
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
    return this.grid.queryBox(
      minX,
      minY,
      maxX,
      maxY,
      result,
      (entity) => entity.id,
    );
  }

  public queryBoxExact(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    result: Entity[] = [],
  ): Entity[] {
    this.queryBox(minX, minY, maxX, maxY, result);
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < result.length; readIndex += 1) {
      const entity = result[readIndex]!;
      const bounds = this.boundsByEntityId.get(entity.id);
      if (
        !bounds ||
        bounds.maxX < minX ||
        bounds.minX > maxX ||
        bounds.maxY < minY ||
        bounds.minY > maxY
      ) {
        continue;
      }
      result[writeIndex] = entity;
      writeIndex += 1;
    }
    result.length = writeIndex;
    return result;
  }

  private upsert(entity: Entity): void {
    const bounds = entity.getWorldBounds();
    this.boundsByEntityId.set(entity.id, bounds);
    this.grid.upsert(
      entity.id,
      entity,
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    );
  }

  public removeEntity(entityId: number): void {
    this.grid.remove(entityId);
    this.boundsByEntityId.delete(entityId);
  }
}
