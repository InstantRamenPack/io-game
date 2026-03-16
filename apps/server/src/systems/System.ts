import type { World } from "@server/world/World.ts";

/**
 * Contract for tick-driven server gameplay systems.
 * Systems receive the authoritative world and a frame delta each update.
 */
export interface System {
  /**
   * Runs one fixed update step for the current world state.
   * @param world Authoritative world being simulated.
   */
  update(world: World): void;
}
