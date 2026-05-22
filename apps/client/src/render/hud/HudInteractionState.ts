import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ChestSlotRef } from "@client/render/hud/ChestView.ts";

export type CraftingTabId = "weapons" | "ammo" | "healing" | "buildings";

export type HudInteractionState = {
  craftingMenuOpen: boolean;
  craftingTab: CraftingTabId;
  inventoryOpen: boolean;
  chestOpen: boolean;
  sectorFeedOpen: boolean;
  openChestEntityId: number | null;
  selectedCraft: ResourceId;
  previewedCraft: ResourceId;
  hoveredInventorySlotIndex: number | null;
  heldInventorySlotIndex: number | null;
  hoveredChestSlotRef: ChestSlotRef | null;
  heldChestSlotRef: ChestSlotRef | null;
};
