import type { World } from "@server/world/World.ts";

/**
 * Contract for tick-driven server gameplay systems.
 * Systems receive the authoritative world and a frame delta each update.
 */
export interface System {
  /**
   * Runs one update step for the current world state.
   * @param world Authoritative world being simulated.
   * @param deltaMs Tick delta in milliseconds.
   */
  update(world: World, deltaMs: number): void;
}
