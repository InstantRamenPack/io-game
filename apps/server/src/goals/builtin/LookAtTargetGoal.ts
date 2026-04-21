import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";

/**
 * Continuously rotates an actor to face its current tracked target.
 */
export class LookAtTargetGoal<
  TSelf extends Entity & GoalActor = Entity & GoalActor,
> extends Goal<TSelf> {
  constructor(priority: number) {
    super(priority, ["look"]);
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    return this.resolveTarget(ctx) !== null;
  }

  public override start(_ctx: GoalContext<TSelf>): void {
    // no-op
  }

  public override tick(ctx: GoalContext<TSelf>): void {
    const target = this.resolveTarget(ctx);
    if (!target) {
      return;
    }

    const deltaX = target.x - ctx.self.x;
    const deltaY = target.y - ctx.self.y;
    if (Math.hypot(deltaX, deltaY) <= Number.EPSILON) {
      return;
    }

    ctx.self.rotation = Math.atan2(deltaY, deltaX);
  }

  public override shouldContinue(ctx: GoalContext<TSelf>): boolean {
    return this.resolveTarget(ctx) !== null;
  }

  public override stop(_ctx: GoalContext<TSelf>): void {
    // no-op
  }

  private resolveTarget(ctx: GoalContext<TSelf>): Entity | null {
    const { targetId } = ctx.self;
    if (targetId === undefined) {
      return null;
    }

    const target = ctx.world.get(targetId);
    return target?.alive ? target : null;
  }
}
