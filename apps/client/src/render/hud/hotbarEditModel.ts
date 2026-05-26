import type { HotbarSlotItem } from "@client/render/hud/HotbarView.ts";
import type { InventorySlotRef } from "@client/render/hud/InventoryView.ts";

export function sanitizeHotbarEditState(options: {
  inventoryOpen: boolean;
  hoveredSlotRef: InventorySlotRef | null;
  heldSlotRef: InventorySlotRef | null;
  hotbarItems: HotbarSlotItem[];
  armorItem: HotbarSlotItem;
}): {
  hoveredSlotRef: InventorySlotRef | null;
  heldSlotRef: InventorySlotRef | null;
} {
  const { inventoryOpen, hoveredSlotRef, heldSlotRef, hotbarItems, armorItem } =
    options;
  if (!inventoryOpen) {
    return {
      hoveredSlotRef: null,
      heldSlotRef: null,
    };
  }

  const isValidRef = (ref: InventorySlotRef | null): boolean => {
    if (!ref) {
      return false;
    }
    if (ref.source === "armor") {
      return ref.index === 0;
    }
    return ref.index >= 0 && ref.index < hotbarItems.length;
  };
  const hasItem = (ref: InventorySlotRef | null): boolean => {
    if (!ref) {
      return false;
    }
    if (ref.source === "armor") {
      return armorItem.typeId !== null;
    }
    return Boolean(hotbarItems[ref.index]?.typeId);
  };

  return {
    hoveredSlotRef: isValidRef(hoveredSlotRef) ? hoveredSlotRef : null,
    heldSlotRef:
      isValidRef(heldSlotRef) && hasItem(heldSlotRef) ? heldSlotRef : null,
  };
}
