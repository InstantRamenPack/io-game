import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type {
  GameClient,
  PointerInput,
} from "@client/client/GameClient.ts";
import type { HudState } from "@client/render/PixiHud.ts";

export type { HudState };

/**
 * Defines the small API exposed by the HUD controller. The goal is to let the
 * rest of the client trigger HUD behavior in semantic terms, such as "toggle
 * the active hotbar slot" or "queue the selected craft recipe", without needing to
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
   * Toggles the crafting panel visibility.
   */
  toggleCraftingMenu(): void;
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
   * Shows or hides the in-game HUD shell.
   */
  setVisible(visible: boolean): void;
};

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
  const hud = gameClient.renderer.createHud({ gameClient, selectors });
  return hud as HudController;
}
