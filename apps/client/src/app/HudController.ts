import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import type { HudState } from "@client/render/PixiHud.ts";

export type { HudState };

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
