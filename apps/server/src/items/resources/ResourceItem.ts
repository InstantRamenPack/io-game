import { Item } from "@server/items/Item.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Shared base for simple concrete inventory resources with one-argument constructors.
 */
export abstract class ResourceItem extends Item {
  protected constructor(id: number, typeId: ResourceId) {
    super(id, typeId);
  }

  public override clone(): this {
    const Ctor = this.constructor as new (id: number) => this;
    const cloned = new Ctor(this.id);
    cloned.ownerId = this.ownerId;
    return cloned;
  }
}
