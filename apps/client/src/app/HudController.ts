import type { AppElements } from "@client/app/AppElements.ts";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import {
  CRAFTABLE_ITEM_TYPE_IDS,
  getItemContent,
} from "@shared/content/catalog.ts";
import type { ItemRecipeContent } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const RESOURCE_TYPE_IDS = ["item:wood", "item:stone", "item:food"] as const;
const HOTBAR_SLOT_COUNT = 9;

/**
 * Stores the local, purely presentational HUD state that does not come from
 * server snapshots. The build/crafting panel toggles and the currently
 * selected build item live here because they are browser UI state, not gameplay
 * authority.
 */
export type HudState = {
  buildMenuOpen: boolean;
  craftingMenuOpen: boolean;
  selectedBuild: ResourceId;
};

/**
 * Defines the small API exposed by the HUD controller. The goal is to let the
 * rest of the client trigger HUD behavior in semantic terms, such as "toggle
 * the build menu" or "queue the selected craft recipe", without needing to
 * know how the DOM is rendered.
 */
export type HudController = {
  /**
   * Returns the current presentational HUD state. Callers should treat the
   * returned object as read-only and use controller methods for mutations.
   */
  getState(): Readonly<HudState>;
  /**
   * Renders the full HUD from the latest client snapshot plus local HUD state.
   */
  refreshUi(): void;
  /**
   * Toggles the build-placement panel visibility.
   */
  toggleBuildMenu(): void;
  /**
   * Toggles the crafting panel visibility.
   */
  toggleCraftingMenu(): void;
  /**
   * Updates the selected build item from a one-based hotkey ordinal.
   * Returns `true` when a matching craftable item existed and was selected.
   */
  selectBuildByOrdinal(ordinal: number): boolean;
  /**
   * Queues a craft request for the currently selected item.
   */
  queueSelectedCraft(): void;
  /**
   * Handles the primary pointer action in world space. When build mode is
   * active, this places the selected structure. Otherwise it forwards a normal
   * attack input to the client runtime.
   */
  handlePrimaryWorldAction(worldPoint: { x: number; y: number }): void;
  /**
   * Resets transient HUD presentation state when a session closes.
   */
  reset(): void;
  /**
   * Reports whether the build panel is currently open.
   */
  isBuildMenuOpen(): boolean;
  /**
   * Reports whether the crafting panel is currently open.
   */
  isCraftingMenuOpen(): boolean;
};

type HudControllerOptions = {
  elements: AppElements;
  gameClient: GameClient;
  selectors: GameSelectors;
};

/**
 * Creates the controller responsible for rendering and mutating the in-game
 * HUD. This module owns the build/crafting panel state, maps snapshot data to
 * DOM fragments, and exposes higher-level intent methods used by hotkeys,
 * pointer actions, and lifecycle handlers.
 */
export function createHudController({
  elements,
  gameClient,
  selectors,
}: HudControllerOptions): HudController {
  const defaultBuildItemTypeId = CRAFTABLE_ITEM_TYPE_IDS[0];
  if (!defaultBuildItemTypeId) {
    throw new Error("Expected at least one craftable item in shared content.");
  }

  const state: HudState = {
    buildMenuOpen: false,
    craftingMenuOpen: false,
    selectedBuild: defaultBuildItemTypeId,
  };

  function getSelectedRecipe(): ItemRecipeContent {
    return getSelectedRecipeForItem(state.selectedBuild);
  }

  function refreshUi(): void {
    if (!elements.hudRoot) {
      return;
    }

    const playerEntity = selectors.getPlayerEntity();
    const worldEntities = selectors.getWorldEntities();
    const buildings = selectors.getTrackedBuildings();
    const activeEffects = selectors.getActiveEffects();
    const performanceRates = gameClient.getMeasuredRates();

    const tickRateLabel =
      performanceRates.tickRate === null
        ? "TPS --"
        : `TPS ${performanceRates.tickRate.toFixed(1)}`;
    const frameRateLabel =
      performanceRates.frameRate === null
        ? "FPS --"
        : `FPS ${performanceRates.frameRate.toFixed(1)}`;

    if (elements.worldStat) {
      elements.worldStat.textContent = playerEntity
        ? `${playerEntity.name ?? "Survivor"}  HP ${playerEntity.hp ?? 0}/${playerEntity.maxHp ?? 0}`
        : "Awaiting welcome packet...";
    }

    if (elements.worldDetail) {
      elements.worldDetail.textContent = [
        `Tick ${gameClient.worldState?.latestTick ?? 0}`,
        tickRateLabel,
        frameRateLabel,
        `${buildings.length} structures`,
        `${worldEntities.length} entities`,
      ].join(" // ");
    }

    if (elements.resourceStrip) {
      elements.resourceStrip.innerHTML = RESOURCE_TYPE_IDS.map((typeId) => {
        return `
          <div class="resource-chip">
            <strong>${selectors.countInventoryType(typeId)}</strong>
            <span>${selectors.escapeHtml(selectors.formatTypeLabel(typeId))}</span>
          </div>
        `;
      }).join("");
    }

    if (elements.effectStrip) {
      const effects =
        activeEffects.length > 0 ? activeEffects : ["No active buffs"];
      elements.effectStrip.innerHTML = effects
        .map((effect) => {
          return `
            <div class="effect-chip">
              <strong>${selectors.escapeHtml(effect)}</strong>
              <span>${effect === "No active buffs" ? "Status" : "Aura"}</span>
            </div>
          `;
        })
        .join("");
    }

    if (elements.hotbarList) {
      const inventory = selectors.getInventory();
      const hotbarWeapons = selectors.getHotbarWeapons();
      const activeWeaponIndex = inventory?.activeWeaponIndex ?? null;
      elements.hotbarList.innerHTML = Array.from(
        { length: HOTBAR_SLOT_COUNT },
        (_, slotIndex) => {
          const weapon = hotbarWeapons[slotIndex] ?? null;
          if (!weapon) {
            return `
              <div class="hotbar-slot">
                <div class="slot-index">Slot ${slotIndex + 1}</div>
                <div class="slot-label">Empty</div>
              </div>
            `;
          }

          const isActive = activeWeaponIndex === slotIndex;
          const ammoLabel =
            typeof weapon.ammoInMag === "number" &&
            typeof weapon.magSize === "number"
              ? `${weapon.ammoInMag}/${weapon.magSize}`
              : "Ready";
          return `
            <div class="hotbar-slot${isActive ? " active" : ""}">
              <div class="slot-index">Slot ${slotIndex + 1}</div>
              <div class="slot-label">${selectors.escapeHtml(selectors.formatTypeLabel(weapon.typeId))}</div>
              <div class="slot-count">${selectors.escapeHtml(ammoLabel)}</div>
            </div>
          `;
        },
      ).join("");
    }

    if (elements.placementPanel) {
      elements.placementPanel.hidden = !state.buildMenuOpen;
    }

    if (elements.buildList) {
      elements.buildList.innerHTML = CRAFTABLE_ITEM_TYPE_IDS.map(
        (itemTypeId, index) => {
          const recipe = getSelectedRecipeForItem(itemTypeId);
          const availableCount = selectors.countInventoryType(itemTypeId);
          return `
            <div class="build-card${state.selectedBuild === itemTypeId ? " selected" : ""}${availableCount > 0 ? "" : " locked"}">
              <div class="build-meta">${index + 1} // ${availableCount > 0 ? `${availableCount} ready` : "Out of stock"}</div>
              <div class="build-title">${selectors.escapeHtml(selectors.formatTypeLabel(itemTypeId))}</div>
              <div class="build-cost">${selectors.escapeHtml(selectors.formatCosts(recipe.costs))}</div>
            </div>
          `;
        },
      ).join("");
    }

    if (elements.buildHint) {
      const selectedRecipe = getSelectedRecipe();
      const availableCount = selectors.countInventoryType(
        state.selectedBuild,
      );
      elements.buildHint.textContent = `${selectedRecipe.hint ?? "Place the selected structure at your cursor."}  ${availableCount} in inventory. Press 1-4 while this panel is open to switch selection. Left click to place.`;
    }

    if (elements.craftingPanel) {
      elements.craftingPanel.hidden = !state.craftingMenuOpen;
    }

    if (elements.craftingList) {
      elements.craftingList.innerHTML = CRAFTABLE_ITEM_TYPE_IDS.map(
        (itemTypeId) => {
          const recipe = getSelectedRecipeForItem(itemTypeId);
          const available = selectors.hasRecipeResources(recipe);
          return `
            <div class="recipe-card${state.selectedBuild === itemTypeId ? " selected" : ""}${available ? "" : " locked"}">
              <div class="recipe-meta">${available ? "Craftable" : "Missing materials"}</div>
              <div class="recipe-title">${selectors.escapeHtml(selectors.formatTypeLabel(itemTypeId))}</div>
              <div class="recipe-cost">${selectors.escapeHtml(selectors.formatCosts(recipe.costs))}</div>
            </div>
          `;
        },
      ).join("");
    }

    if (elements.craftingHint) {
      const nearbyLabels = buildings
        .map(
          (entity) =>
            entity.label ??
            entity.name ??
            selectors.formatTypeLabel(entity.typeId),
        )
        .slice(0, 3)
        .join(", ");

      elements.craftingHint.textContent =
        nearbyLabels.length > 0
          ? `Nearby structures: ${nearbyLabels}  Press Enter to craft ${selectors.formatTypeLabel(state.selectedBuild)}.`
          : `Press Enter to craft ${selectors.formatTypeLabel(state.selectedBuild)}.`;
    }
  }

  function toggleBuildMenu(): void {
    state.buildMenuOpen = !state.buildMenuOpen;
    refreshUi();
  }

  function toggleCraftingMenu(): void {
    state.craftingMenuOpen = !state.craftingMenuOpen;
    refreshUi();
  }

  function selectBuildByOrdinal(ordinal: number): boolean {
    const nextItemTypeId = CRAFTABLE_ITEM_TYPE_IDS[ordinal - 1];
    if (!nextItemTypeId) {
      return false;
    }

    state.selectedBuild = nextItemTypeId;
    refreshUi();
    return true;
  }

  function queueSelectedCraft(): void {
    gameClient.queueCraftItem(state.selectedBuild);
    refreshUi();
  }

  function handlePrimaryWorldAction(worldPoint: {
    x: number;
    y: number;
  }): void {
    if (state.buildMenuOpen) {
      gameClient.queueBuildPlacement(
        state.selectedBuild,
        worldPoint.x,
        worldPoint.y,
      );
      return;
    }

    gameClient.queueAttack(worldPoint.x, worldPoint.y);
  }

  function reset(): void {
    state.buildMenuOpen = false;
    state.craftingMenuOpen = false;
    refreshUi();
  }

  function getSelectedRecipeForItem(itemTypeId: ResourceId): ItemRecipeContent {
    const recipe = getItemContent(itemTypeId)?.recipe;
    if (!recipe) {
      throw new Error(`Expected craft recipe for ${itemTypeId}.`);
    }
    return recipe;
  }

  return {
    getState: () => state,
    refreshUi,
    toggleBuildMenu,
    toggleCraftingMenu,
    selectBuildByOrdinal,
    queueSelectedCraft,
    handlePrimaryWorldAction,
    reset,
    isBuildMenuOpen: () => state.buildMenuOpen,
    isCraftingMenuOpen: () => state.craftingMenuOpen,
  };
}
