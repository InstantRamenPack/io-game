import { deriveTypeIdFromStaticMetadata } from "@server/registry/typeMetadata.ts";
import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export class Item {
  public static readonly kind = "item" as const;
  public static readonly resourceName: string = "";
  public static readonly stackMax: number = 1;

  public static get typeId(): ResourceId {
    return deriveTypeIdFromStaticMetadata(this);
  }

  public id: number;
  public readonly typeId: ResourceId;
  public ownerId?: number;

  /** Initializes common identity fields for item subclasses. */
  public constructor(id: number) {
    this.id = id;
    this.typeId = (this.constructor as typeof Item).typeId;
  }

  /** Per-tick extension point for subclass-specific behavior. */
  public tick(_world: World): void {
    // placeholder; per-entity logic hooks can be added later
  }

  /** @returns A shallow copy of this item. */
  public clone(): Item {
    const Ctor = this.constructor as new (id: number) => Item;
    const cloned = new Ctor(this.id);
    cloned.ownerId = this.ownerId;
    return cloned;
  }
}
