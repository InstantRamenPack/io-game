import { Entity } from "@server/entities/Entity.ts";
import type { ItemStack } from "@server/items/ItemStack.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { PickupSnapshot } from "@shared/net/snapshots.ts";

export class ItemEntity extends Entity {
  public static readonly typeId = "pickup:item_entity" as const;

  /** Creates an item-world entity. Optionally give it an inventory. */
  public constructor(id: number, itemStack: ItemStack) {
    // item entities rarely need an inventory, but we support it generically
    super(id, ItemEntity.typeId, new Inventory(1));
    this.inventory?.add(itemStack);
    this.radius = 14;
  }

  public override toSnapshot(): PickupSnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "pickup",
      inventory: this.inventory?.toSnapshot() ?? [],
    };
  }
}
