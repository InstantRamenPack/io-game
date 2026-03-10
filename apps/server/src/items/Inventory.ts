/**
 * Fixed-slot inventory for ItemStacks.
 */
import { ItemStack } from "./ItemStack.ts";

export class Inventory {
  slots: Array<ItemStack | null>;
  activeIndex: number;

  constructor(slotCount: number) {
    this.slots = new Array(slotCount).fill(null);
    this.activeIndex = 0;
  }

  /** Adds a stack; returns true if fully added. */
  add(stack: ItemStack, itemRegistry?: any): boolean {
    // try merging into existing slots first
    for (let i = 0; i < this.slots.length && stack.stackSize > 0; i++) {
      const s = this.slots[i];
      if (s && s.item.id === stack.item.id) {
        // if a registry is provided we could enforce stack limits, else just merge all
        let space = Infinity;
        if (itemRegistry) {
          try {
            const entry = itemRegistry.get(stack.item.id);
            if (entry && typeof entry.stackMax === "number") {
              space = entry.stackMax - s.stackSize;
            }
          } catch {
            space = Infinity;
          }
        }
        const toTransfer = Math.min(space, stack.stackSize);
        if (toTransfer > 0) {
          s.stackSize += toTransfer;
          stack.stackSize -= toTransfer;
        }
      }
    }

    // put remaining into empty slots
    for (let i = 0; i < this.slots.length && stack.stackSize > 0; i++) {
      if (this.slots[i] === null) {
        this.slots[i] = new ItemStack(stack.item.clone(), stack.stackSize, stack.meta);
        stack.stackSize = 0;
        break;
      }
    }

    return stack.stackSize === 0;
  }

  /** Removes up to amount from slot; returns removed stack or null. */
  remove(slot: number, amount?: number): ItemStack | null {
    if (slot < 0 || slot >= this.slots.length) return null;
    const s = this.slots[slot];
    if (!s) return null;

    if (amount === undefined || amount >= s.stackSize) {
      this.slots[slot] = null;
      return s;
    }

    // partial remove
    const removedItem = s.item.clone();
    s.stackSize -= amount;
    return new ItemStack(removedItem, amount, s.meta ? { ...s.meta } : undefined);
  }

  /** @returns Active slot stack. */
  getActive(): ItemStack | null {
    if (this.activeIndex < 0 || this.activeIndex >= this.slots.length) return null;
    // non-undefined assertion after bounds check
    return this.slots[this.activeIndex] ?? null;
  }

  /** Sets active slot index. */
  setActive(i: number): void {
    if (i < 0 || i >= this.slots.length) return;
    this.activeIndex = i;
  }

  /** @returns True if inventory contains required items. */
  hasItems(req: { itemId: string; amount: number }[]): boolean {
    const counts: Record<string, number> = {};
    for (const slot of this.slots) {
      if (slot) {
        counts[slot.item.id.toString()] = (counts[slot.item.id.toString()] || 0) + slot.stackSize;
      }
    }
    for (const r of req) {
      if ((counts[r.itemId] || 0) < r.amount) return false;
    }
    return true;
  }

  /** Consumes required items if available. */
  consume(req: { itemId: string; amount: number }[]): boolean {
    if (!this.hasItems(req)) return false;
    for (const r of req) {
      let remaining = r.amount;
      for (let i = 0; i < this.slots.length && remaining > 0; i++) {
        const slot = this.slots[i];
        if (slot && slot.item.id.toString() === r.itemId) {
          if (slot.stackSize <= remaining) {
            remaining -= slot.stackSize;
            this.slots[i] = null;
          } else {
            slot.stackSize -= remaining;
            remaining = 0;
          }
        }
      }
    }
    return true;
  }

  /** Serializes the inventory into an array of item stack snapshots. */
  toSnapshot(): (import("@shared/net/snapshots.ts").ItemStackSnapshot | null)[] {
    return this.slots.map((s) => s ? s.toSnapshot() : null);
  }
}
