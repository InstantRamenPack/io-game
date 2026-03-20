import type { AppElements } from "@client/app/AppElements.ts";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type { HudController } from "@client/app/HudController.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import { getResourceNamespace } from "@shared/ids/ResourceId.ts";

type DebugBridgeOptions = {
  elements: AppElements;
  gameClient: GameClient;
  selectors: GameSelectors;
  hudController: HudController;
};

/**
 * Installs the small browser globals used by automated tests and ad hoc
 * debugging. The bridge intentionally exposes a concise, structured view of
 * the current game state while keeping the actual UI/controller modules free
 * of direct `window` mutation.
 */
export function installDebugBridge({
  elements,
  gameClient,
  selectors,
  hudController,
}: DebugBridgeOptions): void {
  function renderGameToText(): string {
    const playerEntity = selectors.getPlayerEntity();
    const worldEntities = selectors.getWorldEntities();
    const hudState = hudController.getState();
    const performanceRates = gameClient.getMeasuredRates();

    return JSON.stringify({
      mode: elements.menuRoot?.style.display === "none" ? "game" : "menu",
      connected:
        gameClient.networkClient.socket?.readyState === WebSocket.OPEN &&
        elements.menuRoot?.style.display === "none",
      coordinateSystem: "origin top-left; +x right; +y down",
      tick: gameClient.worldState?.latestTick ?? null,
      performance: {
        tickRate: performanceRates.tickRate,
        frameRate: performanceRates.frameRate,
      },
      player: playerEntity
        ? {
            id: playerEntity.id,
            name: playerEntity.name ?? null,
            x: Math.round(playerEntity.x),
            y: Math.round(playerEntity.y),
            hp: playerEntity.hp,
            maxHp: playerEntity.maxHp,
          }
        : null,
      resources: {
        wood: selectors.countInventoryType("item:wood"),
        stone: selectors.countInventoryType("item:stone"),
        food: selectors.countInventoryType("item:food"),
        wallItems: selectors.countInventoryType("item:wall"),
        towerItems: selectors.countInventoryType("item:tower"),
        windmillItems: selectors.countInventoryType("item:windmill"),
        craftingStationItems: selectors.countInventoryType(
          "item:crafting_station",
        ),
      },
      ui: {
        buildingMenuOpen: hudState.buildMenuOpen,
        craftingMenuOpen: hudState.craftingMenuOpen,
        selectedBuild: hudState.selectedBuild,
      },
      buildings: worldEntities
        .filter((entity) => getResourceNamespace(entity.typeId) === "building")
        .map((entity) => ({
          id: entity.id,
          label:
            entity.label ??
            entity.name ??
            selectors.formatTypeLabel(entity.typeId),
          x: Math.round(entity.x),
          y: Math.round(entity.y),
          typeId: entity.typeId,
          buildingType: selectors.getTypePath(entity.typeId),
        })),
      enemies: worldEntities
        .filter((entity) => getResourceNamespace(entity.typeId) === "enemy")
        .map((entity) => ({
          id: entity.id,
          x: Math.round(entity.x),
          y: Math.round(entity.y),
          hp: entity.hp,
          maxHp: entity.maxHp,
        })),
      projectiles: worldEntities
        .filter(
          (entity) => getResourceNamespace(entity.typeId) === "projectile",
        )
        .map((entity) => ({
          id: entity.id,
          x: Math.round(entity.x),
          y: Math.round(entity.y),
        })),
    });
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = (ms: number) => {
    gameClient.advanceTime(ms);
    hudController.refreshUi();
  };
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
  }
}
