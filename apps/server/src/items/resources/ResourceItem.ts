import { Item } from "@server/items/Item.ts";

/**
 * Shared base for simple concrete inventory resources with one-argument constructors.
 */
export abstract class ResourceItem extends Item {
  protected constructor(id: number) {
    super(id);
  }

  public override clone(): this {
    const Ctor = this.constructor as new (id: number) => this;
    const cloned = new Ctor(this.id);
    cloned.ownerId = this.ownerId;
    return cloned;
  }
}
