import "../index.css";
import { getAppElements } from "@client/app/AppElements.ts";
import { createGameSelectors } from "@client/app/gameSelectors.ts";
import { createHudController } from "@client/app/HudController.ts";
import { createChatController } from "@client/app/ChatController.ts";
import { createDeathController } from "@client/app/DeathController.ts";
import { createGameOverController } from "@client/app/GameOverController.ts";
import { createLaunchController } from "@client/app/LaunchController.ts";
import { createLobbyHudController } from "@client/app/LobbyHudController.ts";
import { createMenuController } from "@client/app/MenuController.ts";
import { createSessionUiController } from "@client/app/session/SessionUiController.ts";
import {
  hydratePlayerNameInput,
  resolvePlayerName,
} from "@client/app/playerName.ts";
import { installDebugBridge } from "@client/app/installDebugBridge.ts";
import { GameClient } from "@client/client/GameClient.ts";
import { DEBUG_HITBOX, DEBUG_INTERPOLATION_MODE } from "@client/debug.ts";
import { GameInputRouter } from "@client/input/GameInputRouter.ts";
import { isKeyboardTextEntryTarget } from "@client/input/isKeyboardTextEntryTarget.ts";
import { isNearRecyclerWithItem } from "@client/render/hud/recyclerInteraction.ts";
import { getNearestPickup } from "@client/render/hud/pickupInteraction.ts";
import { findNearestChest } from "@client/render/hud/chestInteraction.ts";
import { hasNearbyCraftingStation } from "@client/render/hud/craftingStationInteraction.ts";
import { getNearDamagedTower } from "@client/render/hud/towerRepairInteraction.ts";
import { parseDebugNetworkProfileName } from "@client/net/DebugNetworkSimulator.ts";
import { GameConfig } from "@shared/config/GameConfig.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  ClientRuntimeConfigSchema,
  type ClientRuntimeConfig,
} from "@shared/config/ClientRuntimeConfig.ts";

/**
 * Browser entrypoint for the client application.
 * This file intentionally acts only as the composition root: it resolves DOM
 * handles, constructs the runtime/services/controllers, wires them together,
 * and loads runtime configuration. All feature behavior now lives in the
 * concern-specific modules under `apps/client/src/app`.
 */
const elements = getAppElements();
const gameConfig = new GameConfig();
const gameClient = new GameClient(gameConfig, {
  debugHitbox: DEBUG_HITBOX,
  debugInterpolationMode: DEBUG_INTERPOLATION_MODE,
});
const debugNetworkProfile = parseDebugNetworkProfileName(
  new URLSearchParams(window.location.search).get("netProfile") ??
    window.localStorage.getItem("io-game.netProfile"),
);
const autoStartSession =
  new URLSearchParams(window.location.search).get("autoStart") === "1";
if (debugNetworkProfile) {
  const seed = Number(
    new URLSearchParams(window.location.search).get("netSeed") ??
      window.localStorage.getItem("io-game.netSeed") ??
      1,
  );
  gameClient.setDebugNetworkProfile(debugNetworkProfile, seed);
}
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
  sessionUiController,
});
const launchController = createLaunchController({
  elements,
  gameClient,
  gameConfig,
  menuController,
  sessionUiController,
  hudController,
  chatController,
  lobbyHudController,
  resolvePlayerName: () => resolvePlayerName(elements.playerNameInput),
});

createGameOverController({
  elements,
  gameClient,
  sessionUiController,
});

gameClient.setPointerActionHandler((pointer) => {
  return hudController.handlePointerInput(pointer);
});
window.addEventListener(
  "wheel",
  (event) => {
    const screenPoint = gameClient.renderer.clientToScreen(
      event.clientX,
      event.clientY,
    );
    if (
      hudController.handleCraftListWheel(
        screenPoint.x,
        screenPoint.y,
        event.deltaY,
      )
    ) {
      event.preventDefault();
    }
  },
  { passive: false },
);
gameClient.onWorldUpdated(() => {
  hudController.setVisible(true);
  hudController.refreshUi();
  deathController.sync();
});
gameClient.networkClient.onClose(() => {
  hudController.setVisible(true);
  deathController.sync();
});
gameClient.networkClient.onError(() => {
  hudController.setVisible(true);
  deathController.sync();
});
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  installDebugBridge({
    gameClient,
    selectors,
    hudController,
    sessionUiController,
  });
  window.gameClient = gameClient;
}

let recyclerHoldActive = false;

function cancelRecyclerHold(): void {
  recyclerHoldActive = false;
  hudController.setRecyclerHoldStartMs(null);
}

let repairHoldActive = false;

function cancelRepairHold(): void {
  repairHoldActive = false;
  hudController.setRepairHoldStartMs(null);
}

gameClient.onWorldUpdated(() => {
  if (
    recyclerHoldActive &&
    !isNearRecyclerWithItem(
      selectors.getPlayerEntity(),
      selectors.getRecyclers(),
      selectors.getInventory(),
    )
  ) {
    cancelRecyclerHold();
  }

  if (
    repairHoldActive &&
    getNearDamagedTower(
      selectors.getPlayerEntity(),
      selectors.getTrackedBuildings(),
    ) === null
  ) {
    cancelRepairHold();
  }
});

new GameInputRouter({
  getContext: () => ({
    sessionMode: sessionUiController.getState().mode,
    chatOpen: chatController.isOpen(),
    inventoryOpen: hudController.isInventoryOpen(),
    craftingOpen: hudController.isCraftingMenuOpen(),
    chestOpen: hudController.isChestOpen(),
    textEntryActive: isKeyboardTextEntryTarget(document.activeElement),
    nearRecyclerWithItem: isNearRecyclerWithItem(
      selectors.getPlayerEntity(),
      selectors.getRecyclers(),
      selectors.getInventory(),
    ),
    nearPickup:
      getNearestPickup(selectors.getPlayerEntity(), selectors.getPickups()) !==
      null,
    nearChest:
      findNearestChest(selectors.getPlayerEntity(), selectors.getChests())
        ?.id ?? null,
    nearCraftingStation: hasNearbyCraftingStation(
      selectors.getPlayerEntity(),
      selectors.getCraftingStations(),
    ),
    nearDamagedTower:
      getNearDamagedTower(
        selectors.getPlayerEntity(),
        selectors.getTrackedBuildings(),
      )?.id ?? null,
    hasConsumable:
      selectors.countInventoryType("item:medkit") > 0
        ? ("item:medkit" as ResourceId)
        : selectors.countInventoryType("item:crude_bandage") > 0
          ? ("item:crude_bandage" as ResourceId)
          : null,
  }),
  dispatch: (command) => {
    switch (command.type) {
      case "openChat":
        chatController.open();
        return;
      case "openChatSlash":
        chatController.open("/");
        return;
      case "toggleSectorFeed": {
        const sectorFeedVisible = hudController.toggleSectorFeed();
        lobbyHudController.setSectorFeedVisible(sectorFeedVisible);
        return;
      }
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
      case "openChest":
        hudController.openChest(command.chestEntityId);
        return;
      case "openCraftingMenu":
        hudController.toggleCraftingMenu();
        return;
      case "startRecycleHold":
        recyclerHoldActive = true;
        hudController.setRecyclerHoldStartMs(performance.now());
        return;
      case "cancelRecycleHold":
        cancelRecyclerHold();
        return;
      case "recycleItem":
        gameClient.queueRecycle();
        recyclerHoldActive = false;
        hudController.setRecyclerHoldStartMs(null);
        return;
      case "startRepairHold":
        repairHoldActive = true;
        hudController.setRepairHoldStartMs(performance.now());
        return;
      case "cancelRepairHold":
        cancelRepairHold();
        return;
      case "repairTower":
        gameClient.queueRepairTower(command.towerId);
        repairHoldActive = false;
        hudController.setRepairHoldStartMs(null);
        return;
      case "useConsumable":
        gameClient.queueUseConsumable(command.typeId);
        return;
    }
  },
}).bind(window);

hydratePlayerNameInput(elements.playerNameInput);
deathController.sync();

void loadRuntimeConfig().then((runtimeConfig) => {
  launchController.applyRuntimeConfig(runtimeConfig);
  if (elements.gameRoot) {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    void gameClient
      .initRenderer(elements.gameRoot)
      .then(() => {
        gameClient.startLobbyPreview(wsUrl);
      })
      .catch((error) => {
        console.error("Failed to initialize lobby renderer:", error);
      });
  }
  if (autoStartSession) {
    window.setTimeout(() => elements.launchBtn?.click(), 0);
  }
});

async function loadRuntimeConfig(): Promise<ClientRuntimeConfig> {
  const response = await fetch("/runtime-config");
  if (!response.ok) {
    throw new Error("Unable to load runtime config.");
  }
  const parsed = ClientRuntimeConfigSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Invalid runtime config.");
  }
  return parsed.data;
}

declare global {
  interface Window {
    gameClient?: GameClient;
  }
}
