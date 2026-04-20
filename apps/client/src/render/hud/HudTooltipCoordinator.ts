import {
  buildCraftTooltipContent,
  buildInventoryTooltipContent,
  type HudTooltipContent,
} from "@client/render/hud/hudPresentationModels.ts";
import type { CraftingModalEntry } from "@client/render/hud/CraftingModal.ts";
import type { ScreenRect } from "@client/render/renderTypes.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { InventorySnapshot } from "@shared/net/snapshots.ts";

type TooltipState = {
  content: HudTooltipContent;
  rect: ScreenRect;
};

export class HudTooltipCoordinator {
  public resolveTooltipState(options: {
    inventoryOpen: boolean;
    hoveredInventorySlotIndex: number | null;
    inventory: InventorySnapshot | undefined;
    getInventorySlotRect: (slotIndex: number) => ScreenRect | null;
    craftingMenuOpen: boolean;
    hoveredCraftItemTypeId: ResourceId | null;
    hoveredCraftPreview: boolean;
    craftEntries: CraftingModalEntry[];
    getCraftRect: (typeId: ResourceId) => ScreenRect | null;
    getCraftPreviewRect: () => ScreenRect | null;
  }): TooltipState | null {
    const {
      inventoryOpen,
      hoveredInventorySlotIndex,
      inventory,
      getInventorySlotRect,
      craftingMenuOpen,
      hoveredCraftItemTypeId,
      hoveredCraftPreview,
      craftEntries,
      getCraftRect,
      getCraftPreviewRect,
    } = options;

    if (inventoryOpen && hoveredInventorySlotIndex !== null) {
      const slot = inventory?.hotbarSlots[hoveredInventorySlotIndex];
      const rect = getInventorySlotRect(hoveredInventorySlotIndex);
      const content = slot ? buildInventoryTooltipContent(slot) : null;
      if (rect && content) {
        return { content, rect };
      }
    }

    if (craftingMenuOpen && hoveredCraftItemTypeId !== null) {
      const entry = craftEntries.find(
        (item) => item.typeId === hoveredCraftItemTypeId,
      );
      if (!entry) {
        return null;
      }
      const rect = hoveredCraftPreview
        ? getCraftPreviewRect()
        : getCraftRect(hoveredCraftItemTypeId);
      if (!rect) {
        return null;
      }
      return {
        content: buildCraftTooltipContent(entry),
        rect,
      };
    }

    return null;
  }
}
