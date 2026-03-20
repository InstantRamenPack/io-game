import type { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import { Player } from "@server/entities/Player.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";

/**
 * Maintains the nearest valid player target for the acting goal-controlled entity.
 */
export class TargetEntityGoal<
  TSelf extends GoalControlledEntity = GoalControlledEntity,
> extends Goal<TSelf> {
  /**
   * Creates a target-acquisition goal for live player entities.
   * @param priority Lower values run first.
   */
  constructor(priority: number) {
    super(priority, ["target"]);
  }

  override canStart(_ctx: GoalContext<TSelf>): boolean {
    return true;
  }

  override start(_ctx: GoalContext<TSelf>): void {
    // no-op for continuous targeting
  }

  override tick(ctx: GoalContext<TSelf>): void {
    const currentTarget = this.resolveValidTarget(ctx, ctx.self.targetId);
    if (currentTarget) {
      ctx.self.targetId = currentTarget.id;
      return;
    }

    const aggroRangeSquared = ctx.self.aggroRange * ctx.self.aggroRange;
    let bestTarget: Player | null = null;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const player of ctx.world.entities.queryInstances(Player)) {
      if (!player.alive) {
        continue;
      }

      const distanceSquared = this.distanceSquared(
        ctx.self.x,
        ctx.self.y,
        player.x,
        player.y,
      );
      if (
        distanceSquared > aggroRangeSquared ||
        distanceSquared >= bestDistanceSquared
      ) {
        continue;
      }

      bestTarget = player;
      bestDistanceSquared = distanceSquared;
    }

    ctx.self.targetId = bestTarget?.id;
  }

  override shouldContinue(_ctx: GoalContext<TSelf>): boolean {
    return true;
  }

  override stop(_ctx: GoalContext<TSelf>): void {
    // no-op for continuous targeting
  }

  private resolveValidTarget(
    ctx: GoalContext<TSelf>,
    targetId: number | undefined,
  ): Player | null {
    if (targetId === undefined) {
      return null;
    }

    const target = ctx.world.get(targetId);
    if (!(target instanceof Player) || !target.alive) {
      return null;
    }

    const distanceSquared = this.distanceSquared(
      ctx.self.x,
      ctx.self.y,
      target.x,
      target.y,
    );
    const aggroRangeSquared = ctx.self.aggroRange * ctx.self.aggroRange;
    return distanceSquared <= aggroRangeSquared ? target : null;
  }

  private distanceSquared(
    leftX: number,
    leftY: number,
    rightX: number,
    rightY: number,
  ): number {
    const deltaX = rightX - leftX;
    const deltaY = rightY - leftY;
    return deltaX * deltaX + deltaY * deltaY;
  }
}
