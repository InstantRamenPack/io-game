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
   * Performs any start-of-session HUD invalidation work.
   */
  start(): void;
  /**
   * Performs any shutdown cleanup.
   */
  stop(): void;
};

type RuntimeStatusControllerOptions = {
  hudController: HudController;
};

/**
 * Creates the compatibility wrapper for launch lifecycle hooks. HUD updates
 * are event-driven elsewhere, so start/stop are now lightweight.
 */
export function createRuntimeStatusController({
  hudController,
}: RuntimeStatusControllerOptions): RuntimeStatusController {
  function refresh(): void {
    hudController.refreshUi();
  }

  function start(): void {
    refresh();
  }

  function stop(): void {
    // no-op: HUD invalidation is event-driven
  }

  return {
    refresh,
    start,
    stop,
  };
}
