import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { World } from "@server/world/World.ts";

/**
 * Reusable runtime bundle passed to each goal during selection and ticking.
 */
export class GoalContext<TSelf extends GoalActor = GoalActor> {
  public world!: World;
  public self!: TSelf;

  /**
   * Creates the context for one acting entity on the current tick.
   * @param world Authoritative world state.
   * @param self Entity whose goals are being evaluated.
   */
  constructor(world?: World, self?: TSelf) {
    if (!world || !self) {
      return;
    }
    this.world = world;
    this.self = self;
  }

  public reset(world: World, self: TSelf): this {
    this.world = world;
    this.self = self;
    return this;
  }
}
