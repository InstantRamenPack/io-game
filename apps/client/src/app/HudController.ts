import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import type { HudState, PixiHud } from "@client/render/PixiHud.ts";

export type { HudState };

export type HudRuntime = PixiHud;

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
