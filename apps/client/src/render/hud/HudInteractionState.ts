import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ChestSlotRef } from "@client/render/hud/ChestView.ts";

export type HudInteractionState = {
  craftingMenuOpen: boolean;
  inventoryOpen: boolean;
  chestOpen: boolean;
  openChestEntityId: number | null;
  selectedCraft: ResourceId;
  previewedCraft: ResourceId;
  hoveredInventorySlotIndex: number | null;
  heldInventorySlotIndex: number | null;
  hoveredChestSlotRef: ChestSlotRef | null;
  heldChestSlotRef: ChestSlotRef | null;
};
