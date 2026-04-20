import type { HotbarSlotItem } from "@client/render/hud/HotbarView.ts";
import type {
  InventorySlotSnapshot,
  InventorySnapshot,
} from "@shared/net/snapshots.ts";

export function computeHotbarActiveIndex(options: {
  inventory: InventorySnapshot | undefined;
  pendingHotbarIndex: number | undefined;
}): number | null {
  const { inventory, pendingHotbarIndex } = options;
  if (!inventory) {
    return null;
  }

  if (
    typeof pendingHotbarIndex === "number" &&
    pendingHotbarIndex >= 0 &&
    pendingHotbarIndex < inventory.hotbarSlots.length
  ) {
    return pendingHotbarIndex;
  }

  return inventory.selectedHotbarIndex;
}

export function toHotbarSlotItems(
  slots: readonly InventorySlotSnapshot[],
): HotbarSlotItem[] {
  return slots.map((slot) => toSlotItem(slot));
}

function toSlotItem(slot: InventorySlotSnapshot): HotbarSlotItem {
  if (slot.kind === "empty") {
    return {
      typeId: null,
      count: null,
      showCountWhenOne: false,
      ammoInMag: null,
      magSize: null,
      reserveMagCount: null,
      reloadTicksRemaining: null,
    };
  }

  if (slot.kind === "buildable") {
    return {
      typeId: slot.typeId,
      count: slot.count,
      showCountWhenOne: true,
      ammoInMag: null,
      magSize: null,
      reserveMagCount: null,
      reloadTicksRemaining: null,
    };
  }

  return {
    typeId: slot.typeId,
    count: null,
    showCountWhenOne: false,
    ammoInMag: typeof slot.ammoInMag === "number" ? slot.ammoInMag : null,
    magSize: typeof slot.magSize === "number" ? slot.magSize : null,
    reserveMagCount:
      typeof slot.reserveMagCount === "number" ? slot.reserveMagCount : null,
    reloadTicksRemaining:
      typeof slot.reloadTicksRemaining === "number"
        ? slot.reloadTicksRemaining
        : null,
  };
}
