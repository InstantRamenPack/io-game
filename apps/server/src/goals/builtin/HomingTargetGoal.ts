import type { Projectile } from "@server/entities/Projectile.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";
import { resolveInterceptPoint } from "@server/goals/math/InterceptSolver.ts";
import { goalTargetResolver } from "@server/goals/services/GoalTargetResolver.ts";

/**
 * Acquires the nearest valid combat target and continuously steers a projectile toward it.
 */
export class HomingTargetGoal<
  TSelf extends Projectile = Projectile,
> extends Goal<TSelf> {
  private readonly seekRadius: number;
  private readonly turnBlend: number;
  private readonly queryBuffer: Entity[] = [];
  private cachedResolutionTick = -1;
  private cachedTarget: Entity | null = null;

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
    const aimPoint = this.resolveAimPoint(ctx, target);
    const deltaX = aimPoint.x - ctx.self.x;
    const deltaY = aimPoint.y - ctx.self.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= Number.EPSILON) {
      return;
    }

    ctx.self.steerTowardVelocity(
      (deltaX / distance) * ctx.self.speed,
      (deltaY / distance) * ctx.self.speed,
      ctx.self.speed * this.turnBlend,
    );
  }

  public override shouldContinue(ctx: GoalContext<TSelf>): boolean {
    return this.resolveTargetCandidate(ctx) !== null;
  }

  public override stop(ctx: GoalContext<TSelf>): void {
    ctx.self.targetId = undefined;
  }

  private resolveTargetCandidate(ctx: GoalContext<TSelf>): Entity | null {
    if (this.cachedResolutionTick === ctx.world.tick) {
      return this.cachedTarget;
    }

    const trackedTarget = goalTargetResolver.resolveTrackedCombatTarget(ctx);
    const resolvedTarget =
      (trackedTarget && this.isWithinSeekRadius(ctx, trackedTarget)
        ? trackedTarget
        : null) ??
      goalTargetResolver.findNearestCombatTargetInRange(
        ctx,
        this.seekRadius,
        this.queryBuffer,
      );
    this.cachedResolutionTick = ctx.world.tick;
    this.cachedTarget = resolvedTarget;
    return resolvedTarget;
  }

  private resolveAimPoint(
    ctx: GoalContext<TSelf>,
    target: Entity,
  ): { x: number; y: number } {
    return resolveInterceptPoint({
      originX: ctx.self.x,
      originY: ctx.self.y,
      targetX: target.x,
      targetY: target.y,
      targetVx: target.vx,
      targetVy: target.vy,
      projectileSpeed: Math.max(
        ctx.self.speed,
        Math.hypot(ctx.self.vx, ctx.self.vy),
      ),
    });
  }

  private isWithinSeekRadius(ctx: GoalContext<TSelf>, target: Entity): boolean {
    return goalTargetResolver.isWithinRange(
      ctx.self.x,
      ctx.self.y,
      target,
      this.seekRadius * this.seekRadius,
    );
  }
}
