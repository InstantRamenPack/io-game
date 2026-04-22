import {
  findCraftingStationAtWorldPoint,
  hasNearbyCraftingStation,
  isPlayerNearCraftingStation,
} from "@client/render/hud/craftingStationInteraction.ts";
import type { CraftingModalEntry } from "@client/render/hud/CraftingModal.ts";
import type { HudInteractionState } from "@client/render/hud/HudInteractionState.ts";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type { PointerInput } from "@client/client/clientTypes.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export class CraftingHudCoordinator {
  private hoveredCraftItemTypeId: ResourceId | null = null;
  private hoveredCraftPreview = false;

  public getHoveredCraftItemTypeId(): ResourceId | null {
    return this.hoveredCraftItemTypeId;
  }

  public isHoveredCraftPreview(): boolean {
    return this.hoveredCraftPreview;
  }

  public open(state: HudInteractionState): void {
    state.craftingMenuOpen = true;
    state.previewedCraft = state.selectedCraft;
    this.hoveredCraftItemTypeId = null;
    this.hoveredCraftPreview = false;
  }

  public close(state: HudInteractionState): void {
    state.craftingMenuOpen = false;
    state.previewedCraft = state.selectedCraft;
    this.hoveredCraftItemTypeId = null;
    this.hoveredCraftPreview = false;
  }

  public reset(state: HudInteractionState): void {
    this.close(state);
  }

  public moveSelection(
    state: HudInteractionState,
    delta: number,
    craftableTypeIds: readonly ResourceId[],
  ): boolean {
    if (!state.craftingMenuOpen || delta === 0) {
      return false;
    }

    const currentIndex = Math.max(
      0,
      craftableTypeIds.indexOf(state.selectedCraft),
    );
    const nextIndex = clamp(
      currentIndex + delta,
      0,
      craftableTypeIds.length - 1,
    );
    const nextCraft = craftableTypeIds[nextIndex];
    if (!nextCraft) {
      return false;
    }

    this.hoveredCraftItemTypeId = null;
    this.hoveredCraftPreview = false;
    state.selectedCraft = nextCraft;
    state.previewedCraft = nextCraft;
    return true;
  }

  public syncProximity(
    state: HudInteractionState,
    selectors: GameSelectors,
  ): {
    changed: boolean;
    hasNearbyCraftingStation: boolean;
  } {
    const hasNearbyStation = this.hasNearbyCraftingStation(selectors);
    if (state.craftingMenuOpen && !hasNearbyStation) {
      this.close(state);
      return { changed: true, hasNearbyCraftingStation: hasNearbyStation };
    }
    return { changed: false, hasNearbyCraftingStation: hasNearbyStation };
  }

  public handlePointerMove(options: {
    state: HudInteractionState;
    pointer: PointerInput;
    getCraftAtPoint: (screenX: number, screenY: number) => ResourceId | null;
    getPreviewedCraftAtPoint: (
      screenX: number,
      screenY: number,
      previewedCraft: ResourceId,
    ) => ResourceId | null;
  }): boolean {
    const { state, pointer, getCraftAtPoint, getPreviewedCraftAtPoint } =
      options;
    if (!state.craftingMenuOpen) {
      return false;
    }

    const hoveredCraftTile = getCraftAtPoint(pointer.screenX, pointer.screenY);
    const hoveredPreviewCraft =
      hoveredCraftTile === null
        ? getPreviewedCraftAtPoint(
            pointer.screenX,
            pointer.screenY,
            state.previewedCraft,
          )
        : null;
    const nextHoveredCraft = hoveredCraftTile ?? hoveredPreviewCraft;
    const nextHoveredCraftPreview =
      hoveredCraftTile === null && hoveredPreviewCraft !== null;
    if (
      nextHoveredCraft === this.hoveredCraftItemTypeId &&
      nextHoveredCraftPreview === this.hoveredCraftPreview
    ) {
      return true;
    }

    this.hoveredCraftItemTypeId = nextHoveredCraft;
    this.hoveredCraftPreview = nextHoveredCraftPreview;
    state.previewedCraft = nextHoveredCraft ?? state.selectedCraft;
    return true;
  }

  public handleCraftModalPointerDown(options: {
    state: HudInteractionState;
    screenX: number;
    screenY: number;
    canSubmitCraft: (itemTypeId: ResourceId) => boolean;
    queueCraftItem: (itemTypeId: ResourceId) => void;
    isCraftButtonAtPoint: (screenX: number, screenY: number) => boolean;
    getCraftAtPoint: (screenX: number, screenY: number) => ResourceId | null;
  }): boolean {
    const {
      state,
      screenX,
      screenY,
      canSubmitCraft,
      queueCraftItem,
      isCraftButtonAtPoint,
      getCraftAtPoint,
    } = options;
    if (isCraftButtonAtPoint(screenX, screenY)) {
      const craftTarget = state.previewedCraft;
      state.selectedCraft = craftTarget;
      if (canSubmitCraft(craftTarget)) {
        queueCraftItem(craftTarget);
      }
      return true;
    }

    const clickedCraft = getCraftAtPoint(screenX, screenY);
    if (!clickedCraft) {
      return false;
    }

    this.hoveredCraftItemTypeId = clickedCraft;
    this.hoveredCraftPreview = false;
    state.selectedCraft = clickedCraft;
    state.previewedCraft = clickedCraft;
    return true;
  }

  public handleGameplayPointerDown(options: {
    state: HudInteractionState;
    pointer: PointerInput;
    selectors: GameSelectors;
    openCraftingMenu: () => void;
    queueBuildPlacement: (x: number, y: number) => void;
  }): boolean {
    const { state, pointer, selectors, openCraftingMenu, queueBuildPlacement } =
      options;
    if (state.craftingMenuOpen) {
      return true;
    }

    const clickedStation = findCraftingStationAtWorldPoint(
      selectors.getCraftingStations(),
      pointer.worldX,
      pointer.worldY,
    );
    if (
      clickedStation &&
      isPlayerNearCraftingStation(selectors.getPlayerEntity(), clickedStation)
    ) {
      openCraftingMenu();
      return true;
    }

    const inventory = selectors.getInventory();
    const selectedSlot =
      inventory?.hotbarSlots[inventory.selectedHotbarIndex ?? 0] ?? null;
    if (selectedSlot?.kind === "buildable") {
      queueBuildPlacement(pointer.worldX, pointer.worldY);
      return true;
    }

    return false;
  }

  public buildCraftEntries(options: {
    craftableTypeIds: readonly ResourceId[];
    formatTypeLabel: (typeId: string) => string;
    formatCosts: (costs: Array<{ typeId: string; amount: number }>) => string;
    hasRecipeResources: (itemTypeId: ResourceId) => boolean;
    getRecipeForItem: (itemTypeId: ResourceId) => {
      hint?: string;
      outputAmount: number;
      costs: Array<{ typeId: string; amount: number }>;
    };
  }): CraftingModalEntry[] {
    const {
      craftableTypeIds,
      formatTypeLabel,
      formatCosts,
      hasRecipeResources,
      getRecipeForItem,
    } = options;
    return craftableTypeIds.map((itemTypeId) => {
      const recipe = getRecipeForItem(itemTypeId);
      return {
        typeId: itemTypeId,
        label: formatTypeLabel(itemTypeId),
        description:
          recipe.hint ?? "Assemble this item at a nearby crafting station.",
        costsLabel: formatCosts(recipe.costs),
        outputAmount: recipe.outputAmount,
        available: hasRecipeResources(itemTypeId),
      } satisfies CraftingModalEntry;
    });
  }

  public hasNearbyCraftingStation(selectors: GameSelectors): boolean {
    return this.hasNearbyCraftingStationInternal(selectors);
  }

  private hasNearbyCraftingStationInternal(selectors: GameSelectors): boolean {
    return hasNearbyCraftingStation(
      selectors.getPlayerEntity(),
      selectors.getCraftingStations(),
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
