import { Item } from "./Item.ts";
import type { ItemStackSnapshot } from "@shared/net/snapshots.ts";

/**
 * A stack of items, holding an Item instance with its quantity in stackSize.
 */
export class ItemStack {
  item: Item;
  stackSize: number;
  meta?: Record<string, unknown>;

  constructor(item: Item, stackSize: number, meta?: Record<string, unknown>) {
    this.item = item;
    this.stackSize = stackSize;
    if (meta) {
      this.meta = { ...meta };
    }
  }

  /** @returns A copy suitable for safe transfers. */
  clone(): ItemStack {
    return new ItemStack(this.item.clone(), this.stackSize, this.meta ? { ...this.meta } : undefined);
  }

  /** Converts the stack into a network snapshot. */
  toSnapshot(): ItemStackSnapshot {
    return {
      id: this.item.id,
      kind: this.item.kind,
      stackSize: this.stackSize,
      ownerId: this.item.ownerId,
      data: this.item.data,
    };
  }

}
