/**
 * Fixed-slot inventory for ItemStacks.
 */
import type { ItemRequirement } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ItemStackSnapshot } from "@shared/net/snapshots.ts";
import { ItemStack } from "@server/items/ItemStack.ts";
import { itemTypeRegistry } from "@server/registry/registries.ts";

function shallowMetaEquals(
  leftMeta: Record<string, unknown> | undefined,
  rightMeta: Record<string, unknown> | undefined,
): boolean {
  if (leftMeta === rightMeta) {
    return true;
  }
  if (!leftMeta || !rightMeta) {
    return false;
  }

  const leftEntries = Object.entries(leftMeta);
  const rightEntries = Object.entries(rightMeta);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  for (const [key, value] of leftEntries) {
    if (rightMeta[key] !== value) {
      return false;
    }
  }

  return true;
}

export class Inventory {
  public slots: Array<ItemStack | null>;
  public activeIndex: number;

  public constructor(slotCount: number) {
    this.slots = new Array(slotCount).fill(null);
    this.activeIndex = 0;
  }

  /** Adds a stack; returns true if fully added. */
  public add(stack: ItemStack): boolean {
    const definition = itemTypeRegistry.require(stack.item.typeId);
    let remaining = stack.stackSize;

    for (let i = 0; i < this.slots.length && remaining > 0; i += 1) {
      const slot = this.slots[i];
      if (
        !slot ||
        slot.item.typeId !== stack.item.typeId ||
        definition.stackMax <= 1 ||
        !shallowMetaEquals(slot.meta, stack.meta)
      ) {
        continue;
      }

      const space = Math.max(0, definition.stackMax - slot.stackSize);
      const transfer = Math.min(space, remaining);
      if (transfer <= 0) {
        continue;
      }
      slot.stackSize += transfer;
      remaining -= transfer;
    }

    while (remaining > 0) {
      const slotIndex = this.slots.findIndex((slot) => slot === null);
      if (slotIndex < 0) {
        break;
      }

      const nextStackSize = Math.min(definition.stackMax, remaining);
      this.slots[slotIndex] = new ItemStack(
        stack.item.clone(),
        nextStackSize,
        stack.meta ? { ...stack.meta } : undefined,
      );
      remaining -= nextStackSize;
    }

    stack.stackSize = remaining;
    return remaining === 0;
  }

  /** Removes up to amount from slot; returns removed stack or null. */
  public remove(slot: number, amount?: number): ItemStack | null {
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
    return new ItemStack(
      removedItem,
      amount,
      s.meta ? { ...s.meta } : undefined,
    );
  }

  /** @returns Active slot stack. */
  public getActive(): ItemStack | null {
    if (this.activeIndex < 0 || this.activeIndex >= this.slots.length)
      return null;
    // non-undefined assertion after bounds check
    return this.slots[this.activeIndex] ?? null;
  }

  /** Sets active slot index. */
  public setActive(i: number): void {
    if (i < 0 || i >= this.slots.length) return;
    this.activeIndex = i;
  }

  public canAdd(stack: ItemStack): boolean {
    const simulatedInventory = new Inventory(this.slots.length);
    simulatedInventory.activeIndex = this.activeIndex;
    simulatedInventory.slots = this.slots.map((slot) =>
      slot ? slot.clone() : null,
    );
    return simulatedInventory.add(stack.clone());
  }

  public countType(typeId: ResourceId): number {
    let count = 0;
    for (const slot of this.slots) {
      if (slot?.item.typeId === typeId) {
        count += slot.stackSize;
      }
    }
    return count;
  }

  /** @returns True if inventory contains required items. */
  public hasTypes(requirements: ItemRequirement[]): boolean {
    for (const requirement of requirements) {
      if (this.countType(requirement.typeId) < requirement.amount) {
        return false;
      }
    }
    return true;
  }

  /** Consumes required items if available. */
  public consumeTypes(requirements: ItemRequirement[]): boolean {
    if (!this.hasTypes(requirements)) {
      return false;
    }

    for (const requirement of requirements) {
      let remaining = requirement.amount;
      for (let i = 0; i < this.slots.length && remaining > 0; i += 1) {
        const slot = this.slots[i];
        if (!slot || slot.item.typeId !== requirement.typeId) {
          continue;
        }

        if (slot.stackSize <= remaining) {
          remaining -= slot.stackSize;
          this.slots[i] = null;
        } else {
          slot.stackSize -= remaining;
          remaining = 0;
        }
      }
    }

    return true;
  }

  /** Serializes the inventory into an array of item stack snapshots. */
  public toSnapshot(): (ItemStackSnapshot | null)[] {
    return this.slots.map((s) => (s ? s.toSnapshot() : null));
  }
}
