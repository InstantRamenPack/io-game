import "../index.css";
import { getAppElements } from "@client/app/AppElements.ts";
import { installGameHotkeys } from "@client/app/GameHotkeys.ts";
import { createGameSelectors } from "@client/app/gameSelectors.ts";
import { createHudController } from "@client/app/HudController.ts";
import { createInterpolationDebugPanelController } from "@client/app/InterpolationDebugPanelController.ts";
import { createChatController } from "@client/app/ChatController.ts";
import { createDeathController } from "@client/app/DeathController.ts";
import { createLaunchController } from "@client/app/LaunchController.ts";
import { createMenuController } from "@client/app/MenuController.ts";
import {
  hydratePlayerNameInput,
  resolvePlayerName,
} from "@client/app/playerName.ts";
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
const interpolationDebugPanelController =
  createInterpolationDebugPanelController({
    gameClient,
    hostElement: document.body,
  });
const hudController = createHudController({
  gameClient,
  selectors,
});
const chatController = createChatController({
  elements,
  gameClient,
  hudController,
});
const deathController = createDeathController({
  elements,
  gameClient,
});
const menuController = createMenuController({
  elements,
  authController,
});
const launchController = createLaunchController({
  elements,
  gameClient,
  gameConfig,
  authController,
  menuController,
  hudController,
  chatController,
  resolvePlayerName: () => resolvePlayerName(elements.playerNameInput),
});

gameClient.setPointerActionHandler((pointer) => {
  return hudController.handlePointerInput(pointer);
});

function syncInterpolationDebugPanel(): void {
  interpolationDebugPanelController.syncState({
    menuVisible: elements.menuRoot?.style.display !== "none",
    configuredPlayerName: elements.playerNameInput?.value ?? null,
    resolvedPlayerName: selectors.getPlayerEntity()?.name ?? null,
  });
}

gameClient.onWorldUpdated(() => {
  hudController.refreshUi();
  deathController.sync();
  syncInterpolationDebugPanel();
});
gameClient.onSessionReady(() => {
  syncInterpolationDebugPanel();
});
gameClient.networkClient.onClose(() => {
  deathController.sync();
  syncInterpolationDebugPanel();
});
gameClient.networkClient.onError(() => {
  deathController.sync();
  syncInterpolationDebugPanel();
});

elements.playerNameInput?.addEventListener("input", () => {
  syncInterpolationDebugPanel();
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
deathController.sync();
syncInterpolationDebugPanel();

void authController.initialize((runtimeConfig) => {
  launchController.applyRuntimeConfig(runtimeConfig);
  syncInterpolationDebugPanel();
});
