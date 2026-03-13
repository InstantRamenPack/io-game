import type { Enemy } from "@server/entities/Enemy.ts";
import type { World } from "@server/world/World.ts";

/**
 * Immutable runtime bundle passed to each goal during selection and ticking.
 */
export class GoalContext {
  readonly world: World;
  readonly self: Enemy;

  /**
   * Creates the context for one acting enemy on the current tick.
   * @param world Authoritative world state.
   * @param self Enemy whose goals are being evaluated.
   */
  constructor(world: World, self: Enemy) {
    this.world = world;
    this.self = self;
  }
}
