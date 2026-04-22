import "../index.css";
import { getAppElements } from "@client/app/AppElements.ts";
import { createGameSelectors } from "@client/app/gameSelectors.ts";
import { createHudController } from "@client/app/HudController.ts";
import { createChatController } from "@client/app/ChatController.ts";
import { createDeathController } from "@client/app/DeathController.ts";
import { createLaunchController } from "@client/app/LaunchController.ts";
import { createLobbyHudController } from "@client/app/LobbyHudController.ts";
import { createMenuController } from "@client/app/MenuController.ts";
import { createSessionUiController } from "@client/app/session/SessionUiController.ts";
import {
  hydratePlayerNameInput,
  resolvePlayerName,
} from "@client/app/playerName.ts";
import { installDebugBridge } from "@client/app/installDebugBridge.ts";
import { AuthController } from "@client/auth/Auth.ts";
import { GameClient } from "@client/client/GameClient.ts";
import { DEBUG_HITBOX, DEBUG_INTERPOLATION_MODE } from "@client/debug.ts";
import { GameInputRouter } from "@client/input/GameInputRouter.ts";
import { isKeyboardTextEntryTarget } from "@client/input/isKeyboardTextEntryTarget.ts";
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
const sessionUiController = createSessionUiController(elements);

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
  sessionUiController,
});
const lobbyHudController = createLobbyHudController({
  elements,
  gameClient,
});
const deathController = createDeathController({
  elements,
  gameClient,
  sessionUiController,
});
const menuController = createMenuController({
  elements,
  authController,
  sessionUiController,
});
const launchController = createLaunchController({
  elements,
  gameClient,
  gameConfig,
  authController,
  menuController,
  sessionUiController,
  hudController,
  chatController,
  lobbyHudController,
  resolvePlayerName: () => resolvePlayerName(elements.playerNameInput),
});

gameClient.setPointerActionHandler((pointer) => {
  return hudController.handlePointerInput(pointer);
});
gameClient.onWorldUpdated(() => {
  hudController.refreshUi();
  deathController.sync();
});
gameClient.networkClient.onClose(() => {
  deathController.sync();
});
gameClient.networkClient.onError(() => {
  deathController.sync();
});
installDebugBridge({
  elements,
  gameClient,
  selectors,
  hudController,
  sessionUiController,
});

if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  window.gameClient = gameClient;
}

new GameInputRouter({
  getContext: () => ({
    sessionMode: sessionUiController.getState().mode,
    chatOpen: chatController.isOpen(),
    inventoryOpen: hudController.isInventoryOpen(),
    craftingOpen: hudController.isCraftingMenuOpen(),
    chestOpen: hudController.isChestOpen(),
    textEntryActive: isKeyboardTextEntryTarget(document.activeElement),
  }),
  dispatch: (command) => {
    switch (command.type) {
      case "openChat":
        chatController.open();
        return;
      case "openChatSlash":
        chatController.open("/");
        return;
      case "toggleCraftingMenu":
        hudController.toggleCraftingMenu();
        return;
      case "toggleInventory":
        hudController.toggleInventory();
        return;
      case "closeCraftingMenu":
        if (hudController.isCraftingMenuOpen()) {
          hudController.toggleCraftingMenu();
        }
        return;
      case "closeInventory":
        if (hudController.isInventoryOpen()) {
          hudController.toggleInventory();
        }
        return;
      case "closeChest":
        hudController.closeChest();
        return;
      case "moveCraftSelection":
        hudController.moveCraftSelection(command.delta);
        return;
      case "queueSelectedCraft":
        hudController.queueSelectedCraft();
        return;
      case "selectHotbarOrdinal":
        hudController.selectHotbarItemByOrdinal(command.ordinal);
        return;
      case "dropSelectedItem":
        gameClient.queueDropSelectedItem(command.dropWholeStack);
        return;
      case "pickupNearestItem":
        gameClient.queuePickupNearbyItem();
        return;
    }
  },
}).bind(window);

hydratePlayerNameInput(elements.playerNameInput);
menuController.refreshGateUi();
deathController.sync();

void authController.initialize((runtimeConfig) => {
  launchController.applyRuntimeConfig(runtimeConfig);
});

declare global {
  interface Window {
    gameClient?: GameClient;
  }
}
