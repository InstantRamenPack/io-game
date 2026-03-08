import type { EntitySnapshot } from "@shared/net/snapshots.ts";

/**
 * Rendering adapter for visible entity state.
 * The current implementation is intentionally small while the gameplay client is still minimal.
 */
export class PixiRenderer {
  private entities = new Map<number, EntitySnapshot>();

  /**
   * Replaces the current visible entity set.
   * @param entities Interpolated entities keyed by id.
   */
  sync(entities: Map<number, EntitySnapshot>): void {
    this.entities = new Map(entities);
  }

  /**
   * Advances render internals for one frame.
   * @param _deltaMs Frame delta in milliseconds.
   */
  update(_deltaMs: number): void {
    // placeholder
  }

  /**
   * Placeholder spawn hook for future renderer-specific setup.
   * @param _id Entity id being created.
   * @param _kind Entity kind being created.
   */
  spawn(_id: number, _kind: string): void {
    // placeholder
  }

  /**
   * Removes an entity from the renderer cache.
   * @param id Entity id to remove.
   */
  despawn(id: number): void {
    this.entities.delete(id);
  }
}
