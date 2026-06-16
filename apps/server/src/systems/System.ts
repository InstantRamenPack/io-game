import type { World } from "@server/world/World.ts";

/**
 * Contract for tick-driven server gameplay systems.
 */
export interface System {
  /** Runs one fixed update step for the current world state. */
  update(world: World): void;
}
