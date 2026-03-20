import type { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import type { World } from "@server/world/World.ts";

/**
 * Immutable runtime bundle passed to each goal during selection and ticking.
 */
export class GoalContext<
  TSelf extends GoalControlledEntity = GoalControlledEntity,
> {
  readonly world: World;
  readonly self: TSelf;

  /**
   * Creates the context for one acting entity on the current tick.
   * @param world Authoritative world state.
   * @param self Entity whose goals are being evaluated.
   */
  constructor(world: World, self: TSelf) {
    this.world = world;
    this.self = self;
  }
}
