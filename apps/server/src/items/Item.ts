import type { World } from "@server/world/World.ts";
import type { ItemKind } from "@shared/ids/ItemKinds.ts";

export class Item {
  id: number;
  kind: ItemKind;
  ownerId?: number;
  data: Record<string, unknown> = {};

  /** Initializes common identity fields for entity subclasses. */
  constructor(id: number, kind: ItemKind) {
    this.id = id;
    this.kind = kind;
  }

  /** Per-tick extension point for subclass-specific behavior. */
  tick(_world: World): void {
    // placeholder; per-entity logic hooks can be added later
  }

  /** @returns A shallow copy of this item. */
  clone(): Item {
    const cloned = new Item(this.id, this.kind);
    cloned.ownerId = this.ownerId;
    cloned.data = { ...this.data };
    return cloned;
  }
}
