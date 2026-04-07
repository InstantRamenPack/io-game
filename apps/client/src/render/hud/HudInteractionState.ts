import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type HudInteractionState = {
  craftingMenuOpen: boolean;
  inventoryOpen: boolean;
  selectedCraft: ResourceId;
  previewedCraft: ResourceId;
  hoveredInventorySlotIndex: number | null;
  heldInventorySlotIndex: number | null;
};
