import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import type { Item } from "@server/items/Item.ts";
import type { ItemStackSnapshot } from "@shared/net/snapshots.ts";

/**
 * A stack of items, holding an Item instance with its quantity in stackSize.
 */
export class ItemStack {
  public item: Item;
  public stackSize: number;
  public meta?: Record<string, unknown>;

  public constructor(
    item: Item,
    stackSize: number,
    meta?: Record<string, unknown>,
  ) {
    this.item = item;
    this.stackSize = stackSize;
    if (meta) {
      this.meta = { ...meta };
    }
  }

  /** @returns A copy suitable for safe transfers. */
  public clone(): ItemStack {
    return new ItemStack(
      this.item.clone(),
      this.stackSize,
      this.meta ? { ...this.meta } : undefined,
    );
  }

  /** Converts the stack into a network snapshot. */
  public toSnapshot(): ItemStackSnapshot {
    if (this.item instanceof RangedWeapon) {
      const ammoSnapshot = this.item.getAmmoSnapshot();
      return {
        id: this.item.id,
        typeId: this.item.typeId,
        stackSize: this.stackSize,
        ownerId: this.item.ownerId,
        ...ammoSnapshot,
      };
    }

    return {
      id: this.item.id,
      typeId: this.item.typeId,
      stackSize: this.stackSize,
      ownerId: this.item.ownerId,
    };
  }
}
