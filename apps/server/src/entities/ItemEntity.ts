import { Entity } from "@server/entities/Entity.ts";
import { Item } from "@server/items/Item.ts";
import { ItemStack } from "@server/items/ItemStack.ts";
import { Inventory } from "@server/items/Inventory.ts";

export class ItemEntity extends Entity {
  itemStack: ItemStack;
  moveSpeed = 180;

  /** Creates an item-world entity. Optionally give it an inventory. */
  constructor(id: number, itemStack: ItemStack) {
    // item entities rarely need an inventory, but we support it generically
    super(id, "item");
    this.itemStack = itemStack;
    this.radius = 14;
  }

  /** Serialize item-entity state; include the wrapped item snapshot. */
  override toSnapshot(): import("@shared/net/snapshots.ts").EntitySnapshot {
    const snap = super.toSnapshot();
    snap.data = snap.data || {};
    snap.data.item = this.itemStack.toSnapshot();
    return snap;
  }
}