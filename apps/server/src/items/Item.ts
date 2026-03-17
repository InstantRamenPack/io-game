import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export class Item {
  id: number;
  readonly typeId: ResourceId;
  ownerId?: number;
  data: Record<string, unknown> = {};

  /** Initializes common identity fields for item subclasses. */
  constructor(id: number, typeId: ResourceId) {
    this.id = id;
    this.typeId = typeId;
  }

  /** Per-tick extension point for subclass-specific behavior. */
  tick(_world: World): void {
    // placeholder; per-entity logic hooks can be added later
  }

  /** @returns A shallow copy of this item. */
  clone(): Item {
    const cloned = new Item(this.id, this.typeId);
    cloned.ownerId = this.ownerId;
    cloned.data = { ...this.data };
    return cloned;
  }
}
