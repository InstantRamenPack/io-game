import type { EntitySnapshot } from "@shared/net/snapshots.ts";

/** Rendering adapter; currently stores debug entities for MWE. */
export class PixiRenderer {
  private entities = new Map<number, EntitySnapshot>();

  /** Replaces the current visible entity set. */
  sync(entities: Map<number, EntitySnapshot>): void {
    this.entities = new Map(entities);
  }

  /** Advances render internals for one frame. */
  update(_deltaMs: number): void {
    // placeholder
  }

  /** Placeholder spawn hook for future renderer-specific setup. */
  spawn(_id: number, _kind: string): void {
    // placeholder
  }

  /** Removes an entity from the renderer cache. */
  despawn(id: number): void {
    this.entities.delete(id);
  }

  /** Returns cached entities for debugging/tests. */
  getDebugEntities(): EntitySnapshot[] {
    return [...this.entities.values()];
  }
}
