import { canAttackTarget } from "@server/combat/combatRules.ts";
import type { Projectile } from "@server/entities/Projectile.ts";
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
    if (
      !target ||
      !target.alive ||
      !canAttackTarget(ctx.world, ctx.self, target)
    ) {
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
      if (
        !candidate.alive ||
        !canAttackTarget(ctx.world, ctx.self, candidate)
      ) {
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

  private resolveAimPoint(
    ctx: GoalContext<TSelf>,
    target: Entity,
  ): { x: number; y: number } {
    const interceptTime = this.resolveInterceptTime(
      ctx.self.x,
      ctx.self.y,
      target.x,
      target.y,
      target.vx,
      target.vy,
      Math.max(ctx.self.speed, Math.hypot(ctx.self.vx, ctx.self.vy)),
    );
    if (interceptTime === null) {
      return { x: target.x, y: target.y };
    }

    return {
      x: target.x + target.vx * interceptTime,
      y: target.y + target.vy * interceptTime,
    };
  }

  private resolveInterceptTime(
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    targetVx: number,
    targetVy: number,
    projectileSpeed: number,
  ): number | null {
    if (!Number.isFinite(projectileSpeed) || projectileSpeed <= 0) {
      return null;
    }

    const relativeX = targetX - originX;
    const relativeY = targetY - originY;
    const targetSpeedSquared = targetVx * targetVx + targetVy * targetVy;
    const projectileSpeedSquared = projectileSpeed * projectileSpeed;
    const quadraticA = targetSpeedSquared - projectileSpeedSquared;
    const quadraticB = 2 * (relativeX * targetVx + relativeY * targetVy);
    const quadraticC = relativeX * relativeX + relativeY * relativeY;

    if (Math.abs(quadraticA) <= 1e-6) {
      if (Math.abs(quadraticB) <= 1e-6) {
        return null;
      }

      const linearTime = -quadraticC / quadraticB;
      return linearTime > 0 ? linearTime : null;
    }

    const discriminant = quadraticB * quadraticB - 4 * quadraticA * quadraticC;
    if (discriminant < 0) {
      return null;
    }

    const discriminantRoot = Math.sqrt(discriminant);
    const firstTime = (-quadraticB - discriminantRoot) / (2 * quadraticA);
    const secondTime = (-quadraticB + discriminantRoot) / (2 * quadraticA);
    const positiveTimes = [firstTime, secondTime].filter((time) => time > 0);

    if (positiveTimes.length === 0) {
      return null;
    }

    return Math.min(...positiveTimes);
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
