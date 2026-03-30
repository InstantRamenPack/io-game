import { canAttackTarget } from "@server/combat/combatRules.ts";
import { Projectile } from "@server/entities/Projectile.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";

/**
 * Acquires the nearest valid combat target and continuously steers a projectile toward it.
 */
export class HomingTargetGoal<
  TSelf extends Projectile = Projectile,
> extends Goal<TSelf> {
  private readonly seekRadius: number;
  private readonly turnBlend: number;

  constructor(priority: number, seekRadius: number, turnBlend: number) {
    super(priority, ["target", "move"]);
    this.seekRadius = seekRadius;
    this.turnBlend = turnBlend;
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    return this.resolveTargetCandidate(ctx) !== null;
  }

  public override start(_ctx: GoalContext<TSelf>): void {
    // no-op
  }

  public override tick(ctx: GoalContext<TSelf>): void {
    const target = this.resolveTargetCandidate(ctx);
    if (!target) {
      ctx.self.targetId = undefined;
      return;
    }

    ctx.self.targetId = target.id;
    ctx.self.blendHeadingTowardPoint(target.x, target.y, this.turnBlend);
  }

  public override shouldContinue(ctx: GoalContext<TSelf>): boolean {
    return this.resolveTargetCandidate(ctx) !== null;
  }

  public override stop(ctx: GoalContext<TSelf>): void {
    ctx.self.targetId = undefined;
  }

  private resolveTargetCandidate(ctx: GoalContext<TSelf>): Entity | null {
    return (
      this.resolveTrackedTarget(ctx, ctx.self.targetId) ??
      this.findNearestTargetInRange(ctx)
    );
  }

  private resolveTrackedTarget(
    ctx: GoalContext<TSelf>,
    targetId: number | undefined,
  ): Entity | null {
    if (targetId === undefined) {
      return null;
    }

    const target = ctx.world.get(targetId);
    if (!target || !target.alive || !canAttackTarget(ctx.world, ctx.self, target)) {
      return null;
    }

    return this.isWithinSeekRadius(ctx, target) ? target : null;
  }

  private findNearestTargetInRange(ctx: GoalContext<TSelf>): Entity | null {
    let bestTarget: Entity | null = null;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const candidate of ctx.world.spatial.queryBox(
      ctx.self.x - this.seekRadius,
      ctx.self.y - this.seekRadius,
      ctx.self.x + this.seekRadius,
      ctx.self.y + this.seekRadius,
    )) {
      if (!candidate.alive || !canAttackTarget(ctx.world, ctx.self, candidate)) {
        continue;
      }

      const distanceSquared = this.distanceSquared(
        ctx.self.x,
        ctx.self.y,
        candidate.x,
        candidate.y,
      );
      if (
        distanceSquared > this.seekRadius * this.seekRadius ||
        distanceSquared >= bestDistanceSquared
      ) {
        continue;
      }

      bestTarget = candidate;
      bestDistanceSquared = distanceSquared;
    }

    return bestTarget;
  }

  private isWithinSeekRadius(ctx: GoalContext<TSelf>, target: Entity): boolean {
    return (
      this.distanceSquared(ctx.self.x, ctx.self.y, target.x, target.y) <=
      this.seekRadius * this.seekRadius
    );
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
