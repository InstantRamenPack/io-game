import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import {
  GoToPositionGoal,
  type GoalDestination,
} from "@server/goals/builtin/GoToPositionGoal.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";

/**
 * Straight-line chase goal that walks toward the current target entity.
 */
export class GoToTargetGoal<
  TSelf extends GoalActor = GoalActor,
> extends GoToPositionGoal<TSelf> {
  /**
   * Creates a chase goal that follows the acting enemy's current target entity.
   * @param priority Lower values run first.
   * @param arrivalRadius Distance at which the target counts as reached.
   */
  constructor(priority: number, arrivalRadius: number) {
    super(priority, (ctx) => this.resolveDestination(ctx), arrivalRadius);
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    return this.resolveTarget(ctx) !== null && super.canStart(ctx);
  }

  public override shouldContinue(ctx: GoalContext<TSelf>): boolean {
    return this.resolveTarget(ctx) !== null && super.shouldContinue(ctx);
  }

  private resolveTarget(ctx: GoalContext<TSelf>): Entity | null {
    const { targetId } = ctx.self;
    if (targetId === undefined) {
      return null;
    }

    const target = ctx.world.get(targetId);
    if (!target || !target.alive) {
      return null;
    }

    return target;
  }

  private resolveDestination(ctx: GoalContext<TSelf>): GoalDestination | null {
    const target = this.resolveTarget(ctx);
    if (!target) {
      return null;
    }

    return { x: target.x, y: target.y };
  }
}
