import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import type { PointerInput } from "@client/client/clientTypes.ts";
import type { HudState } from "@client/render/PixiHud.ts";

export type { HudState };

/**
 * Defines the small API exposed by the HUD controller. The goal is to let the
 * rest of the client trigger HUD behavior in semantic terms, such as "toggle
 * the active hotbar slot" or "queue the selected craft recipe", without needing to
 * know how the DOM is rendered.
 */
export type HudRuntime = {
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
   * Toggles the crafting panel visibility.
   */
  toggleCraftingMenu(): void;
  /**
   * Toggles the hotbar-layout panel visibility.
   */
  toggleInventory(): void;
  /**
   * Shows or hides the in-game sector feed panel.
   */
  toggleSectorFeed(): boolean;
  /**
   * Updates the active hotbar slot from a one-based hotkey ordinal.
   * Returns `true` when a matching item existed and was selected.
   */
  selectHotbarItemByOrdinal(ordinal: number): boolean;
  /**
   * Moves the keyboard craft selection by the provided delta.
   */
  moveCraftSelection(delta: number): boolean;
  /**
   * Queues a craft request for the currently selected item.
   */
  queueSelectedCraft(): void;
  /**
   * Handles a gameplay pointer event and returns true when the HUD consumed it.
   */
  handlePointerInput(pointer: PointerInput): boolean;
  /**
   * Resets transient HUD presentation state when a session closes.
   */
  reset(): void;
  /**
   * Reports whether the crafting panel is currently open.
   */
  isCraftingMenuOpen(): boolean;
  /**
   * Reports whether the hotbar-layout panel is currently open.
   */
  isInventoryOpen(): boolean;
  /**
   * Reports whether the chest panel is currently open.
   */
  isChestOpen(): boolean;
  /**
   * Closes the chest panel if it is open.
   */
  closeChest(): void;
  /**
   * Opens the chest panel for the given chest entity.
   */
  openChest(chestEntityId: number): void;
  /**
   * Shows or hides the in-game HUD shell.
   */
  setVisible(visible: boolean): void;
  /**
   * Updates the recycler hold-E start time for the progress bar (null to clear).
   */
  setRecyclerHoldStartMs(ms: number | null): void;
  /**
   * Updates the tower repair hold-F start time for the progress bar (null to clear).
   */
  setRepairHoldStartMs(ms: number | null): void;
};

export type HudController = HudRuntime;

type HudControllerOptions = {
  gameClient: GameClient;
  selectors: GameSelectors;
};

/**
 * Creates the controller responsible for rendering and mutating the in-game
 * HUD. Rendering is handled by Pixi, and updates are applied through the
 * PixiRenderer render loop.
 */
export function createHudController({
  gameClient,
  selectors,
}: HudControllerOptions): HudController {
  return gameClient.renderer.createHud({ gameClient, selectors });
}
