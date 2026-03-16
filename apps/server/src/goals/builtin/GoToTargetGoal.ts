import type { Entity } from "@server/entities/Entity.ts";
import {
  GoToPositionGoal,
  type GoalDestination,
} from "@server/goals/builtin/GoToPositionGoal.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";

/**
 * Straight-line chase goal that walks toward the current target entity.
 */
export class GoToTargetGoal extends GoToPositionGoal {
  /**
   * Creates a chase goal that follows the acting enemy's current target entity.
   * @param priority Lower values run first.
   * @param arrivalRadius Distance at which the target counts as reached.
   */
  constructor(priority: number, arrivalRadius: number) {
    super(priority, (ctx) => this.resolveDestination(ctx), arrivalRadius);
  }

  override canStart(ctx: GoalContext): boolean {
    return this.resolveTarget(ctx) !== null && super.canStart(ctx);
  }

  override shouldContinue(ctx: GoalContext): boolean {
    return this.resolveTarget(ctx) !== null && super.shouldContinue(ctx);
  }

  private resolveTarget(ctx: GoalContext): Entity | null {
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

  private resolveDestination(ctx: GoalContext): GoalDestination | null {
    const target = this.resolveTarget(ctx);
    if (!target) {
      return null;
    }

    return { x: target.x, y: target.y };
  }
}
