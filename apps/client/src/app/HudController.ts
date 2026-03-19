import type { AppElements } from "@client/app/AppElements.ts";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import {
  BUILD_RECIPE_IDS,
  getRecipeDefinition,
} from "@shared/content/index.ts";
import type { RecipeDefinition, RecipeId } from "@shared/content/types.ts";

const RESOURCE_TYPE_IDS = ["item:wood", "item:stone", "item:food"] as const;
const HOTBAR_SLOT_COUNT = 9;

/**
 * Stores the local, purely presentational HUD state that does not come from
 * server snapshots. The build/crafting panel toggles and the currently
 * selected recipe live here because they are browser UI state, not gameplay
 * authority.
 */
export type HudState = {
  buildMenuOpen: boolean;
  craftingMenuOpen: boolean;
  selectedBuild: RecipeId;
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
   * Updates the selected build recipe from a one-based hotkey ordinal.
   * Returns `true` when a matching recipe existed and was selected.
   */
  selectBuildByOrdinal(ordinal: number): boolean;
  /**
   * Queues a craft request for the currently selected recipe.
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
  const state: HudState = {
    buildMenuOpen: false,
    craftingMenuOpen: false,
    selectedBuild: BUILD_RECIPE_IDS[0]!,
  };

  function getSelectedRecipe(): RecipeDefinition {
    return getRecipeDefinition(state.selectedBuild);
  }

  function refreshUi(): void {
    if (!elements.hudRoot) {
      return;
    }

    const playerEntity = selectors.getPlayerEntity();
    const worldEntities = selectors.getWorldEntities();
    const buildings = selectors.getTrackedBuildings();
    const activeEffects = selectors.getActiveEffects();

    if (elements.worldStat) {
      elements.worldStat.textContent = playerEntity
        ? `${playerEntity.name ?? "Survivor"}  HP ${playerEntity.hp ?? 0}/${playerEntity.maxHp ?? 0}`
        : "Awaiting welcome packet...";
    }

    if (elements.worldDetail) {
      elements.worldDetail.textContent = `Tick ${gameClient.worldState?.latestTick ?? 0} // ${buildings.length} structures // ${worldEntities.length} entities`;
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
      elements.hotbarList.innerHTML = Array.from(
        { length: HOTBAR_SLOT_COUNT },
        (_, slotIndex) => {
          const stack = selectors.getInventoryStacks()[slotIndex] ?? null;
          if (!stack) {
            return `
              <div class="hotbar-slot">
                <div class="slot-index">Slot ${slotIndex + 1}</div>
                <div class="slot-label">Empty</div>
              </div>
            `;
          }

          const isActive = playerEntity?.activeSlot === slotIndex;
          return `
            <div class="hotbar-slot${isActive ? " active" : ""}">
              <div class="slot-index">Slot ${slotIndex + 1}</div>
              <div class="slot-label">${selectors.escapeHtml(selectors.formatTypeLabel(stack.typeId))}</div>
              <div class="slot-count">x${stack.stackSize}</div>
            </div>
          `;
        },
      ).join("");
    }

    if (elements.placementPanel) {
      elements.placementPanel.hidden = !state.buildMenuOpen;
    }

    if (elements.buildList) {
      elements.buildList.innerHTML = BUILD_RECIPE_IDS.map((recipeId, index) => {
        const recipe = getRecipeDefinition(recipeId);
        const availableCount = selectors.countInventoryType(
          recipe.outputItemTypeId,
        );
        return `
          <div class="build-card${state.selectedBuild === recipeId ? " selected" : ""}${availableCount > 0 ? "" : " locked"}">
            <div class="build-meta">${index + 1} // ${availableCount > 0 ? `${availableCount} ready` : "Out of stock"}</div>
            <div class="build-title">${selectors.escapeHtml(recipe.label)}</div>
            <div class="build-cost">${selectors.escapeHtml(selectors.formatCosts(recipe.costs))}</div>
          </div>
        `;
      }).join("");
    }

    if (elements.buildHint) {
      const selectedRecipe = getSelectedRecipe();
      const availableCount = selectors.countInventoryType(
        selectedRecipe.outputItemTypeId,
      );
      elements.buildHint.textContent = `${selectedRecipe.hint ?? "Place the selected structure at your cursor."}  ${availableCount} in inventory. Press 1-4 while this panel is open to switch selection. Left click to place.`;
    }

    if (elements.craftingPanel) {
      elements.craftingPanel.hidden = !state.craftingMenuOpen;
    }

    if (elements.craftingList) {
      elements.craftingList.innerHTML = BUILD_RECIPE_IDS.map((recipeId) => {
        const recipe = getRecipeDefinition(recipeId);
        const available = selectors.hasRecipeResources(recipe);
        return `
          <div class="recipe-card${state.selectedBuild === recipeId ? " selected" : ""}${available ? "" : " locked"}">
            <div class="recipe-meta">${available ? "Craftable" : "Missing materials"}</div>
            <div class="recipe-title">${selectors.escapeHtml(recipe.label)}</div>
            <div class="recipe-cost">${selectors.escapeHtml(selectors.formatCosts(recipe.costs))}</div>
          </div>
        `;
      }).join("");
    }

    if (elements.craftingHint) {
      const selectedRecipe = getSelectedRecipe();
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
          ? `Nearby structures: ${nearbyLabels}  Press Enter to craft ${selectedRecipe.label}.`
          : `Press Enter to craft ${selectedRecipe.label}.`;
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
    const nextRecipe = BUILD_RECIPE_IDS[ordinal - 1];
    if (!nextRecipe) {
      return false;
    }

    state.selectedBuild = nextRecipe;
    refreshUi();
    return true;
  }

  function queueSelectedCraft(): void {
    gameClient.queueCraftRecipe(state.selectedBuild);
    refreshUi();
  }

  function handlePrimaryWorldAction(worldPoint: {
    x: number;
    y: number;
  }): void {
    if (state.buildMenuOpen) {
      const selectedRecipe = getSelectedRecipe();
      gameClient.queueBuildPlacement(
        selectedRecipe.outputItemTypeId,
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
