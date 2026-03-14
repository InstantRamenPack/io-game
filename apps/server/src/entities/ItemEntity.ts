import { Entity } from "@server/entities/Entity.ts";
import { Item } from "@server/items/Item.ts";
import { ItemStack } from "@server/items/ItemStack.ts";
import { Inventory } from "@server/items/Inventory.ts";

export class ItemEntity extends Entity {

  /** Creates an item-world entity. Optionally give it an inventory. */
  constructor(id: number, itemStack: ItemStack) {
    // item entities rarely need an inventory, but we support it generically
    super(id, "item", new Inventory(1));
    this.inventory?.add(itemStack, 0)
    this.radius = 14;
  }
}