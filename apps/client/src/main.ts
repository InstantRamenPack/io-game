import "../index.css";
import { getAppElements } from "@client/app/AppElements.ts";
import { installGameHotkeys } from "@client/app/GameHotkeys.ts";
import { createGameSelectors } from "@client/app/gameSelectors.ts";
import { createHudController } from "@client/app/HudController.ts";
import { createChatController } from "@client/app/ChatController.ts";
import { createLaunchController } from "@client/app/LaunchController.ts";
import { createMenuController } from "@client/app/MenuController.ts";
import {
  hydratePlayerNameInput,
  resolvePlayerName,
} from "@client/app/playerName.ts";
import { createRuntimeStatusController } from "@client/app/RuntimeStatusController.ts";
import { installDebugBridge } from "@client/app/installDebugBridge.ts";
import { AuthController } from "@client/auth/Auth.ts";
import { GameClient } from "@client/client/GameClient.ts";
import { DEBUG_HITBOX, DEBUG_INTERPOLATION_MODE } from "@client/debug.ts";
import { GameConfig } from "@shared/config/GameConfig.ts";

/**
 * Browser entrypoint for the client application.
 * This file intentionally acts only as the composition root: it resolves DOM
 * handles, constructs the runtime/services/controllers, wires them together,
 * and kicks off auth initialization. All feature behavior now lives in the
 * concern-specific modules under `apps/client/src/app`.
 */
const elements = getAppElements();
const gameConfig = new GameConfig();
const gameClient = new GameClient(gameConfig, {
  debugHitbox: DEBUG_HITBOX,
  debugInterpolationMode: DEBUG_INTERPOLATION_MODE,
});
const authController = new AuthController();

gameClient.bindInput(window);

const selectors = createGameSelectors(gameClient);
const hudController = createHudController({
  gameClient,
  selectors,
});
const chatController = createChatController({
  elements,
  gameClient,
  hudController,
});
const menuController = createMenuController({
  elements,
  authController,
});
const runtimeStatusController = createRuntimeStatusController({
  hudController,
});
const launchController = createLaunchController({
  elements,
  gameClient,
  gameConfig,
  authController,
  menuController,
  hudController,
  chatController,
  runtimeStatusController,
  resolvePlayerName: () => resolvePlayerName(elements.playerNameInput),
});

gameClient.setPointerActionHandler((pointer) => {
  return hudController.handlePointerInput(pointer);
});
gameClient.onWorldUpdated(() => {
  hudController.refreshUi();
});

installGameHotkeys(elements, hudController);
installDebugBridge({
  elements,
  gameClient,
  selectors,
  hudController,
});

hydratePlayerNameInput(elements.playerNameInput);
menuController.refreshGateUi();

void authController.initialize((runtimeConfig) => {
  launchController.applyRuntimeConfig(runtimeConfig);
});
