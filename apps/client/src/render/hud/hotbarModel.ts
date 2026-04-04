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

export function toSlotItem(slot: InventorySlotSnapshot): HotbarSlotItem {
  if (slot.kind === "empty") {
    return {
      typeId: null,
      count: null,
      showCountWhenOne: false,
      ammoFillRatio: null,
    };
  }

  if (slot.kind === "buildable") {
    return {
      typeId: slot.typeId,
      count: slot.count,
      showCountWhenOne: true,
      ammoFillRatio: null,
    };
  }

  return {
    typeId: slot.typeId,
    count: null,
    showCountWhenOne: false,
    ammoFillRatio: getWeaponAmmoFillRatio(slot),
  };
}

function getWeaponAmmoFillRatio(
  slot: Extract<InventorySlotSnapshot, { kind: "weapon" }>,
): number | null {
  if (typeof slot.magSize !== "number" || slot.magSize <= 0) {
    return null;
  }

  if (
    typeof slot.reloadTicksRemaining === "number" &&
    slot.reloadTicksRemaining > 0 &&
    typeof slot.reloadTicks === "number" &&
    slot.reloadTicks > 0
  ) {
    return 1 - slot.reloadTicksRemaining / slot.reloadTicks;
  }

  if (typeof slot.ammoInMag !== "number") {
    return null;
  }

  return slot.ammoInMag / slot.magSize;
}
