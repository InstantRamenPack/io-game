import type { Entity } from "@server/entities/Entity.ts";

/**
 * Uniform-grid spatial index for broad-phase proximity queries.
 * Entities are inserted into every cell touched by their composite hitbox bounds.
 */
export class SpatialIndex {
  private readonly cellSize: number;
  private readonly buckets = new Map<string, Entity[]>();
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
  rebuild(entities: Entity[]): void {
    this.buckets.clear();
    for (const entity of entities) {
      this.insert(entity);
    }
  }

  /**
   * Returns entities whose indexed hitboxes touch cells overlapped by the query box.
   * @param minX Left query edge.
   * @param minY Top query edge.
   * @param maxX Right query edge.
   * @param maxY Bottom query edge.
   * @returns Unique candidate entities from the covered cells.
   */
  queryBox(
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

    for (
      let gridX = this.toCell(minX);
      gridX <= this.toCell(maxX);
      gridX += 1
    ) {
      for (
        let gridY = this.toCell(minY);
        gridY <= this.toCell(maxY);
        gridY += 1
      ) {
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

  private insert(entity: Entity): void {
    const bounds = entity.getWorldBounds();
    const minX = bounds.minX;
    const maxX = bounds.maxX;
    const minY = bounds.minY;
    const maxY = bounds.maxY;

    for (
      let gridX = this.toCell(minX);
      gridX <= this.toCell(maxX);
      gridX += 1
    ) {
      for (
        let gridY = this.toCell(minY);
        gridY <= this.toCell(maxY);
        gridY += 1
      ) {
        const key = this.makeKey(gridX, gridY);
        let bucket = this.buckets.get(key);
        if (!bucket) {
          bucket = [];
          this.buckets.set(key, bucket);
        }
        bucket.push(entity);
      }
    }
  }

  private toCell(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  private makeKey(gridX: number, gridY: number): string {
    return `${gridX}:${gridY}`;
  }
}
