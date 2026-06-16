import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import {
  GoToPositionGoal,
  type GoalDestination,
} from "@server/goals/builtin/GoToPositionGoal.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { goalTargetResolver } from "@server/goals/services/GoalTargetResolver.ts";
import { hashInt } from "@shared/math/hashInt.ts";

const PURSUIT_OFFSET_MIN_RADIUS = 52;
const PURSUIT_OFFSET_RADIUS_VARIANCE = 76;
const PURSUIT_OFFSET_FULL_DISTANCE = 300;
const PURSUIT_OFFSET_ZERO_DISTANCE = 90;

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
    return goalTargetResolver.resolveTrackedLivingTarget(ctx);
  }

  private resolveDestination(ctx: GoalContext<TSelf>): GoalDestination | null {
    const target = this.resolveTarget(ctx);
    if (!target) {
      return null;
    }

    const distanceToTarget = Math.hypot(
      target.x - ctx.self.x,
      target.y - ctx.self.y,
    );
    const offsetScale = clamp01(
      (distanceToTarget - PURSUIT_OFFSET_ZERO_DISTANCE) /
        (PURSUIT_OFFSET_FULL_DISTANCE - PURSUIT_OFFSET_ZERO_DISTANCE),
    );
    const offset = getStablePursuitOffset(ctx.self.id, target.id, offsetScale);
    return {
      x: target.x + offset.x,
      y: target.y + offset.y,
    };
  }
}

function getStablePursuitOffset(
  selfId: number,
  targetId: number,
  scale: number,
): {
  x: number;
  y: number;
} {
  const hash = hashInt(selfId * 73856093 + targetId * 19349663);
  const angle = ((hash & 0xffff) / 0x10000) * Math.PI * 2;
  const radius =
    (PURSUIT_OFFSET_MIN_RADIUS +
      (((hash >>> 16) & 0xff) / 0xff) * PURSUIT_OFFSET_RADIUS_VARIANCE) *
    scale;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
