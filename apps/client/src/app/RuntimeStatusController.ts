import type { HudController } from "@client/app/HudController.ts";
import type { AppElements } from "@client/app/AppElements.ts";
import type { GameClient } from "@client/client/GameClient.ts";

const HOTBAR_SLOT_COUNT = 9;

/**
 * Defines the API for the narrow controller that manages the monospace
 * runtime-status panel shown during gameplay. This panel is intentionally kept
 * separate from the richer HUD so polling logic and textual formatting do not
 * leak back into the rest of the UI code.
 */
export type RuntimeStatusController = {
  /**
   * Recomputes the textual runtime status immediately from the latest client
   * snapshot data and also refreshes the richer HUD panels.
   */
  refresh(): void;
  /**
   * Makes the runtime status panel visible and starts the periodic refresh
   * interval used while a game session is active.
   */
  start(): void;
  /**
   * Stops the polling interval and clears the visible runtime status text.
   */
  stop(): void;
};

type RuntimeStatusControllerOptions = {
  elements: AppElements;
  gameClient: GameClient;
  hudController: HudController;
};

/**
 * Creates the controller responsible for the compact, high-frequency runtime
 * status panel. The panel is refreshed on a short timer because it mirrors
 * rapidly changing weapon and slot state in a simple textual format.
 */
export function createRuntimeStatusController({
  elements,
  gameClient,
  hudController,
}: RuntimeStatusControllerOptions): RuntimeStatusController {
  let runtimeStatusTimer: number | undefined;

  function refresh(): void {
    if (!elements.runtimeStatus) {
      return;
    }

    const hudState = gameClient.getGameplayHudState();
    if (!hudState) {
      elements.runtimeStatus.textContent = [
        "Weapon Syncing...",
        "Ammo Awaiting snapshot",
        "Slots 1 Sword  2 Gun",
        "Fire Left click",
        "B Build  C Craft",
      ].join("\n");
      hudController.refreshUi();
      return;
    }

    const ammoLine = hudState.reloadTicksRemaining
      ? `Reload ${hudState.reloadTicksRemaining} ticks`
      : hudState.ammoLabel
        ? `Ammo ${hudState.ammoLabel}`
        : "Ammo Melee";

    elements.runtimeStatus.textContent = [
      `Weapon ${hudState.activeWeaponLabel}`,
      ammoLine,
      `Slots ${hudState.slotLabels.slice(0, HOTBAR_SLOT_COUNT).join("  ")}`,
      "Fire Left click",
      "B Build  C Craft",
    ].join("\n");
    hudController.refreshUi();
  }

  function start(): void {
    if (!elements.runtimeStatus) {
      return;
    }

    elements.runtimeStatus.hidden = false;
    refresh();

    if (runtimeStatusTimer !== undefined) {
      window.clearInterval(runtimeStatusTimer);
    }

    runtimeStatusTimer = window.setInterval(refresh, 50);
  }

  function stop(): void {
    if (!elements.runtimeStatus) {
      return;
    }

    if (runtimeStatusTimer !== undefined) {
      window.clearInterval(runtimeStatusTimer);
      runtimeStatusTimer = undefined;
    }

    elements.runtimeStatus.hidden = true;
    elements.runtimeStatus.textContent = "";
  }

  return {
    refresh,
    start,
    stop,
  };
}
