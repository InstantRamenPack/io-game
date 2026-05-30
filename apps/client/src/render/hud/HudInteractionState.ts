import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ChestSlotRef } from "@client/render/hud/ChestView.ts";
import type { InventorySlotRef } from "@client/render/hud/InventoryView.ts";

export type CraftingTabId =
  | "weapons"
  | "armor"
  | "ammo"
  | "healing"
  | "buildings";

export type HudInteractionState = {
  craftingMenuOpen: boolean;
  craftingTab: CraftingTabId;
  inventoryOpen: boolean;
  chestOpen: boolean;
  sectorFeedOpen: boolean;
  openChestEntityId: number | null;
  selectedCraft: ResourceId;
  previewedCraft: ResourceId;
  hoveredInventorySlotRef: InventorySlotRef | null;
  heldInventorySlotRef: InventorySlotRef | null;
  hoveredChestSlotRef: ChestSlotRef | null;
  heldChestSlotRef: ChestSlotRef | null;
  recycleHotbarIndex: number | null;
  recycleChestIndex: number | null;
  heldCraftOutputTypeId: ResourceId | null;
};
