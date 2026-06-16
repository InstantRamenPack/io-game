import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";

type TargetEntityCtor = abstract new (...args: never[]) => Entity;
type TargetEntityFilter = (entity: Entity) => boolean;
type TargetEntityGoalOptions = {
  filter?: TargetEntityFilter;
  requireLineOfSight?: boolean;
};

const HIDDEN_TARGET_AGGRO_GRACE_TICKS = 100;
const AGGRO_RETENTION_RADIUS_MULTIPLIER = 1.5;

/**
 * Maintains the nearest valid target instance for the acting goal-controlled entity.
 */
export class TargetEntityGoal<
  TSelf extends GoalActor = GoalActor,
> extends Goal<TSelf> {
  private readonly targetCtor: TargetEntityCtor;
  private readonly aggroRange: number;
  private readonly aggroRangeSquared: number;
  private readonly aggroRetentionRangeSquared: number;
  private readonly filter: TargetEntityFilter | undefined;
  private readonly requireLineOfSight: boolean;
  private cachedResolutionTick = -1;
  private cachedTarget: Entity | null = null;
  private hiddenTargetId: number | undefined;
  private hiddenTargetSinceTick: number | undefined;

  /**
   * Creates a target-acquisition goal for live entities of the requested class.
   * @param priority Lower values run first.
   * @param targetCtor Runtime class to target.
   * @param aggroRange Maximum chase/target acquisition distance.
   * @param options Optional target filtering and visibility requirements.
   */
  constructor(
    priority: number,
    targetCtor: TargetEntityCtor,
    aggroRange: number,
    options?: TargetEntityFilter | TargetEntityGoalOptions,
  ) {
    super(priority, ["target"]);
    this.targetCtor = targetCtor;
    this.aggroRange = aggroRange;
    this.aggroRangeSquared = Number.isFinite(aggroRange)
      ? aggroRange * aggroRange
      : Number.POSITIVE_INFINITY;
    this.aggroRetentionRangeSquared = Number.isFinite(aggroRange)
      ? (aggroRange * AGGRO_RETENTION_RADIUS_MULTIPLIER) ** 2
      : Number.POSITIVE_INFINITY;
    this.filter = typeof options === "function" ? options : options?.filter;
    this.requireLineOfSight =
      typeof options === "function"
        ? false
        : (options?.requireLineOfSight ?? false);
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

  private resolveValidTarget(
    ctx: GoalContext<TSelf>,
    targetId: number | undefined,
  ): Entity | null {
    if (targetId === undefined) {
      return null;
    }

    const target = ctx.world.get(targetId);
    if (!(target instanceof this.targetCtor) || !target.alive) {
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
    return ctx.world.goalFieldCache.findNearestTargetInRange(
      ctx,
      this.targetCtor,
      this.aggroRange,
      this.aggroRangeSquared,
      this.filter,
      this.requireLineOfSight,
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
    return ctx.world.goalFieldCache.canSeeTarget(
      ctx,
      target,
      this.requireLineOfSight,
    );
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
