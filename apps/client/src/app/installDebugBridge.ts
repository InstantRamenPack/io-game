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

export function installDebugBridge({
  elements,
  gameClient,
  selectors,
  hudController,
}: DebugBridgeOptions): void {
  function getInterpolationLog(): string {
    return JSON.stringify(gameClient.getInterpolationDebugLog(), null, 2);
  }

  function clearInterpolationLog(): void {
    gameClient.clearInterpolationDebugLog();
  }

  function downloadInterpolationLog(): void {
    const blob = new Blob([getInterpolationLog()], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `interpolation-debug-log-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function fetchServerLog(): Promise<unknown> {
    try {
      const response = await fetch("/debug-log", {
        cache: "no-store",
      });
      if (!response.ok) {
        return {
          error: `server_debug_log_http_${response.status}`,
        };
      }
      return (await response.json()) as unknown;
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "server_debug_log_fetch_failed",
      };
    }
  }

  async function getLog(): Promise<string> {
    return JSON.stringify(
      {
        generatedAtMs: Date.now(),
        client: {
          interpolation: gameClient.getInterpolationDebugLog(),
        },
        server: await fetchServerLog(),
      },
      null,
      2,
    );
  }

  async function clearLog(): Promise<void> {
    clearInterpolationLog();
    try {
      await fetch("/debug-log", {
        method: "DELETE",
        cache: "no-store",
      });
    } catch {
      // Ignore failed server log clears so client-side clearing still works.
    }
  }

  async function downloadLog(): Promise<void> {
    const blob = new Blob([await getLog()], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `debug-log-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function renderGameToText(): string {
    const playerEntity = selectors.getPlayerEntity();
    const worldEntities = selectors.getWorldEntities();
    const inventory = selectors.getInventory();
    const activeWeaponIndex = inventory?.activeWeaponIndex ?? null;
    const hudState = hudController.getState();
    const performanceRates = gameClient.getMeasuredRates();

    return JSON.stringify({
      mode: elements.menuRoot?.style.display === "none" ? "game" : "menu",
      connected: gameClient.isTransportConnected(),
      sessionReady: gameClient.isSessionReady(),
      coordinateSystem: "origin top-left; +x right; +y down",
      tick: gameClient.worldState?.latestTick ?? null,
      performance: {
        tickRate: performanceRates.tickRate,
        frameRate: performanceRates.frameRate,
      },
      playerEntityId: gameClient.playerEntityId ?? null,
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
      inventory: {
        stackables: inventory?.stackables ?? [],
        weapons: (inventory?.weapons ?? []).map((weapon, weaponIndex) => ({
          ...weapon,
          label: selectors.formatTypeLabel(weapon.typeId),
          active: weaponIndex === activeWeaponIndex,
        })),
        activeWeaponIndex,
      },
      ui: {
        buildingMenuOpen: hudState.buildMenuOpen,
        craftingMenuOpen: hudState.craftingMenuOpen,
        selectedBuild: hudState.selectedBuild,
        selectedCraft: hudState.selectedCraft,
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
      events: gameClient.worldState?.clientWorld?.events ?? [],
    });
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = (ms: number) => {
    gameClient.advanceTime(ms);
    hudController.refreshUi();
  };
  window.get_log = getLog;
  window.clear_log = clearLog;
  window.download_log = downloadLog;
  window.get_interpolation_debug_log = getInterpolationLog;
  window.clear_interpolation_debug_log = clearInterpolationLog;
  window.download_interpolation_debug_log = downloadInterpolationLog;
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    get_log: () => Promise<string>;
    clear_log: () => Promise<void>;
    download_log: () => Promise<void>;
    get_interpolation_debug_log: () => string;
    clear_interpolation_debug_log: () => void;
    download_interpolation_debug_log: () => void;
  }
}
