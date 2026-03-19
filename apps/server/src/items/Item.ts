import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export class Item {
  public id: number;
  public readonly typeId: ResourceId;
  public ownerId?: number;

  /** Initializes common identity fields for item subclasses. */
  public constructor(id: number, typeId: ResourceId) {
    this.id = id;
    this.typeId = typeId;
  }

  /** Per-tick extension point for subclass-specific behavior. */
  public tick(_world: World): void {
    // placeholder; per-entity logic hooks can be added later
  }

  /** @returns A shallow copy of this item. */
  public clone(): Item {
    const cloned = new Item(this.id, this.typeId);
    cloned.ownerId = this.ownerId;
    return cloned;
  }
}
