import type { HudController } from "@client/app/HudController.ts";
/**
 * Defines the API for the narrow controller that keeps the HUD refreshed while
 * gameplay is active. The name remains for compatibility with the launch
 * lifecycle wiring, but the visible runtime-status panel has been retired.
 */
export type RuntimeStatusController = {
  /**
   * Recomputes the HUD immediately from the latest client state.
   */
  refresh(): void;
  /**
   * Starts the periodic HUD refresh interval used while a game session is
   * active.
   */
  start(): void;
  /**
   * Stops the polling interval.
   */
  stop(): void;
};

type RuntimeStatusControllerOptions = {
  hudController: HudController;
};

/**
 * Creates the controller responsible for the short gameplay polling loop that
 * keeps the HUD current between snapshot-driven updates.
 */
export function createRuntimeStatusController({
  hudController,
}: RuntimeStatusControllerOptions): RuntimeStatusController {
  let runtimeStatusTimer: number | undefined;

  function refresh(): void {
    hudController.refreshUi();
  }

  function start(): void {
    refresh();

    if (runtimeStatusTimer !== undefined) {
      window.clearInterval(runtimeStatusTimer);
    }

    runtimeStatusTimer = window.setInterval(refresh, 50);
  }

  function stop(): void {
    if (runtimeStatusTimer !== undefined) {
      window.clearInterval(runtimeStatusTimer);
      runtimeStatusTimer = undefined;
    }
  }

  return {
    refresh,
    start,
    stop,
  };
}
