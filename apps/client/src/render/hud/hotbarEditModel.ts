import type { HotbarSlotItem } from "@client/render/hud/HotbarView.ts";

export function sanitizeHotbarEditState(options: {
  inventoryOpen: boolean;
  hoveredSlotIndex: number | null;
  heldSlotIndex: number | null;
  hotbarItems: HotbarSlotItem[];
}): {
  hoveredSlotIndex: number | null;
  heldSlotIndex: number | null;
} {
  const { inventoryOpen, hoveredSlotIndex, heldSlotIndex, hotbarItems } =
    options;
  if (!inventoryOpen) {
    return {
      hoveredSlotIndex: null,
      heldSlotIndex: null,
    };
  }

  return {
    hoveredSlotIndex:
      hoveredSlotIndex !== null && hoveredSlotIndex < hotbarItems.length
        ? hoveredSlotIndex
        : null,
    heldSlotIndex:
      heldSlotIndex !== null && hotbarItems[heldSlotIndex]?.typeId
        ? heldSlotIndex
        : null,
  };
}
