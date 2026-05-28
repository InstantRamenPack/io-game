import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import {
  COMBAT_OCCLUSION_EPSILON,
  getBlockerRayEntryDistance,
  getEntityRayEntryDistance,
} from "@server/combat/CombatOcclusion.ts";
import type { StaticGeometryBlocker } from "@server/world/StaticGeometryIndex.ts";
import { Goal } from "@server/goals/Goal.ts";

type TargetEntityCtor = abstract new (...args: never[]) => Entity;
type TargetEntityFilter = (entity: Entity) => boolean;
type TargetNearestEntityGoalOptions = {
  filter?: TargetEntityFilter;
  requireLineOfSight?: boolean;
};

const INSTANCE_SCAN_TARGET_LIMIT = 64;
const HIDDEN_TARGET_AGGRO_GRACE_TICKS = 100;
const AGGRO_RETENTION_RADIUS_MULTIPLIER = 1.5;

/**
 * Maintains the nearest valid target among multiple entity classes at one priority.
 */
export class TargetNearestEntityGoal<
  TSelf extends GoalActor = GoalActor,
> extends Goal<TSelf> {
  private readonly targetCtors: readonly TargetEntityCtor[];
  private readonly aggroRange: number;
  private readonly aggroRangeSquared: number;
  private readonly aggroRetentionRangeSquared: number;
  private readonly filter: TargetEntityFilter | undefined;
  private readonly requireLineOfSight: boolean;
  private readonly queryBuffer: Entity[] = [];
  private readonly blockerQueryBuffer: StaticGeometryBlocker[] = [];
  private cachedResolutionTick = -1;
  private cachedTarget: Entity | null = null;
  private hiddenTargetId: number | undefined;
  private hiddenTargetSinceTick: number | undefined;

  constructor(
    priority: number,
    targetCtors: readonly TargetEntityCtor[],
    aggroRange: number,
    options?: TargetNearestEntityGoalOptions,
  ) {
    super(priority, ["target"]);
    if (targetCtors.length === 0) {
      throw new Error("TargetNearestEntityGoal requires at least one target type.");
    }
    this.targetCtors = targetCtors;
    this.aggroRange = aggroRange;
    this.aggroRangeSquared = Number.isFinite(aggroRange)
      ? aggroRange * aggroRange
      : Number.POSITIVE_INFINITY;
    this.aggroRetentionRangeSquared = Number.isFinite(aggroRange)
      ? (aggroRange * AGGRO_RETENTION_RADIUS_MULTIPLIER) ** 2
      : Number.POSITIVE_INFINITY;
    this.filter = options?.filter;
    this.requireLineOfSight = options?.requireLineOfSight ?? false;
  }

  public override canStart(_ctx: GoalContext<TSelf>): boolean {
    return this.resolveTargetCandidate(_ctx) !== null;
  }

  public override start(_ctx: GoalContext<TSelf>): void {
    // no-op for continuous targeting
  }

  public override tick(ctx: GoalContext<TSelf>): void {
    ctx.self.targetId = this.resolveTargetCandidate(ctx)?.id;
  }

  public override shouldContinue(ctx: GoalContext<TSelf>): boolean {
    return this.resolveTargetCandidate(ctx) !== null;
  }

  public override stop(ctx: GoalContext<TSelf>): void {
    ctx.self.targetId = undefined;
    this.clearHiddenTarget();
  }

  private matchesTargetCtor(target: Entity): boolean {
    for (const ctor of this.targetCtors) {
      if (target instanceof ctor) {
        return true;
      }
    }
    return false;
  }

  private resolveValidTarget(
    ctx: GoalContext<TSelf>,
    targetId: number | undefined,
  ): Entity | null {
    if (targetId === undefined) {
      return null;
    }

    const target = ctx.world.get(targetId);
    if (!target || !target.alive || !this.matchesTargetCtor(target)) {
      return null;
    }
    if (this.filter && !this.filter(target)) {
      return null;
    }

    const distanceSquared = this.distanceSquared(
      ctx.self.x,
      ctx.self.y,
      target.x,
      target.y,
    );
    if (distanceSquared > this.aggroRetentionRangeSquared) {
      this.clearHiddenTarget(target.id);
      return null;
    }

    return this.canRetainTrackedTarget(ctx, target) ? target : null;
  }

  private resolveTargetCandidate(ctx: GoalContext<TSelf>): Entity | null {
    if (this.cachedResolutionTick === ctx.world.tick) {
      return this.cachedTarget;
    }

    const resolvedTarget =
      this.resolveValidTarget(ctx, ctx.self.targetId) ??
      this.findNearestTargetInRange(ctx);
    this.cachedResolutionTick = ctx.world.tick;
    this.cachedTarget = resolvedTarget;
    return resolvedTarget;
  }

  private findNearestTargetInRange(ctx: GoalContext<TSelf>): Entity | null {
    let bestTarget: Entity | null = null;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const ctor of this.targetCtors) {
      const instanceTargets = ctx.world.entities.queryInstances(ctor);
      if (instanceTargets.length <= INSTANCE_SCAN_TARGET_LIMIT) {
        for (const target of instanceTargets) {
          if (!this.considerTarget(ctx, target, bestDistanceSquared)) {
            continue;
          }
          const distanceSquared = this.distanceSquared(
            ctx.self.x,
            ctx.self.y,
            target.x,
            target.y,
          );
          bestTarget = target;
          bestDistanceSquared = distanceSquared;
        }
        continue;
      }

      if (Number.isFinite(this.aggroRange)) {
        for (const target of ctx.world.spatial.queryBox(
          ctx.self.x - this.aggroRange,
          ctx.self.y - this.aggroRange,
          ctx.self.x + this.aggroRange,
          ctx.self.y + this.aggroRange,
          this.queryBuffer,
        )) {
          if (!this.considerTarget(ctx, target, bestDistanceSquared)) {
            continue;
          }
          const distanceSquared = this.distanceSquared(
            ctx.self.x,
            ctx.self.y,
            target.x,
            target.y,
          );
          bestTarget = target;
          bestDistanceSquared = distanceSquared;
        }
        continue;
      }

      for (const target of instanceTargets) {
        if (!this.considerTarget(ctx, target, bestDistanceSquared)) {
          continue;
        }
        const distanceSquared = this.distanceSquared(
          ctx.self.x,
          ctx.self.y,
          target.x,
          target.y,
        );
        bestTarget = target;
        bestDistanceSquared = distanceSquared;
      }
    }

    return bestTarget;
  }

  private considerTarget(
    ctx: GoalContext<TSelf>,
    target: Entity,
    bestDistanceSquared: number,
  ): target is Entity {
    if (!this.matchesTargetCtor(target) || !target.alive) {
      return false;
    }
    if (this.filter && !this.filter(target)) {
      return false;
    }
    const distanceSquared = this.distanceSquared(
      ctx.self.x,
      ctx.self.y,
      target.x,
      target.y,
    );
    return (
      distanceSquared <= this.aggroRangeSquared &&
      distanceSquared < bestDistanceSquared &&
      this.canSeeTarget(ctx, target)
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

  private canSeeTarget(ctx: GoalContext<TSelf>, target: Entity): boolean {
    if (!this.requireLineOfSight) {
      return true;
    }

    const deltaX = target.x - ctx.self.x;
    const deltaY = target.y - ctx.self.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= COMBAT_OCCLUSION_EPSILON) {
      return true;
    }

    const directionX = deltaX / distance;
    const directionY = deltaY / distance;
    const targetEntryDistance = getEntityRayEntryDistance(
      target,
      ctx.self.x,
      ctx.self.y,
      directionX,
      directionY,
    );
    const maxVisibleDistance = targetEntryDistance ?? distance;
    const minX = Math.min(ctx.self.x, target.x);
    const minY = Math.min(ctx.self.y, target.y);
    const maxX = Math.max(ctx.self.x, target.x);
    const maxY = Math.max(ctx.self.y, target.y);

    for (const blocker of ctx.world.staticGeometry.queryBox(
      minX,
      minY,
      maxX,
      maxY,
      this.blockerQueryBuffer,
    )) {
      if (blocker.entityId === ctx.self.id || blocker.entityId === target.id) {
        continue;
      }
      const blockerEntryDistance = getBlockerRayEntryDistance(
        blocker,
        ctx.self.x,
        ctx.self.y,
        directionX,
        directionY,
      );
      if (
        blockerEntryDistance !== null &&
        blockerEntryDistance < maxVisibleDistance - COMBAT_OCCLUSION_EPSILON
      ) {
        return false;
      }
    }

    return true;
  }

  private canRetainTrackedTarget(
    ctx: GoalContext<TSelf>,
    target: Entity,
  ): boolean {
    if (!this.requireLineOfSight || this.canSeeTarget(ctx, target)) {
      this.clearHiddenTarget(target.id);
      return true;
    }

    if (this.hiddenTargetId !== target.id) {
      this.hiddenTargetId = target.id;
      this.hiddenTargetSinceTick = ctx.world.tick;
    }

    const hiddenSinceTick = this.hiddenTargetSinceTick ?? ctx.world.tick;
    const hiddenTicks = ctx.world.tick - hiddenSinceTick + 1;
    return hiddenTicks < HIDDEN_TARGET_AGGRO_GRACE_TICKS;
  }

  private clearHiddenTarget(targetId?: number): void {
    if (targetId !== undefined && this.hiddenTargetId !== targetId) {
      return;
    }
    this.hiddenTargetId = undefined;
    this.hiddenTargetSinceTick = undefined;
  }
}
