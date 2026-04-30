import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";

type TargetEntityCtor = abstract new (...args: never[]) => Entity;

const INSTANCE_SCAN_TARGET_LIMIT = 64;

/**
 * Maintains the nearest valid target instance for the acting goal-controlled entity.
 */
export class TargetEntityGoal<
  TSelf extends GoalActor = GoalActor,
> extends Goal<TSelf> {
  private readonly targetCtor: TargetEntityCtor;
  private readonly aggroRange: number;
  private readonly aggroRangeSquared: number;
  private readonly queryBuffer: Entity[] = [];
  private cachedResolutionTick = -1;
  private cachedTarget: Entity | null = null;

  /**
   * Creates a target-acquisition goal for live entities of the requested class.
   * @param priority Lower values run first.
   * @param targetCtor Runtime class to target.
   * @param aggroRange Maximum chase/target acquisition distance.
   */
  constructor(
    priority: number,
    targetCtor: TargetEntityCtor,
    aggroRange: number,
  ) {
    super(priority, ["target"]);
    this.targetCtor = targetCtor;
    this.aggroRange = aggroRange;
    this.aggroRangeSquared = Number.isFinite(aggroRange)
      ? aggroRange * aggroRange
      : Number.POSITIVE_INFINITY;
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

  public override stop(_ctx: GoalContext<TSelf>): void {
    // no-op for continuous targeting
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

    const distanceSquared = this.distanceSquared(
      ctx.self.x,
      ctx.self.y,
      target.x,
      target.y,
    );
    return distanceSquared <= this.aggroRangeSquared ? target : null;
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
    const instanceTargets = ctx.world.entities.queryInstances(this.targetCtor);

    if (instanceTargets.length <= INSTANCE_SCAN_TARGET_LIMIT) {
      for (const target of instanceTargets) {
        if (!target.alive) {
          continue;
        }
        const distanceSquared = this.distanceSquared(
          ctx.self.x,
          ctx.self.y,
          target.x,
          target.y,
        );
        if (
          distanceSquared > this.aggroRangeSquared ||
          distanceSquared >= bestDistanceSquared
        ) {
          continue;
        }

        bestTarget = target;
        bestDistanceSquared = distanceSquared;
      }
      return bestTarget;
    }

    if (Number.isFinite(this.aggroRange)) {
      for (const target of ctx.world.spatial.queryBox(
        ctx.self.x - this.aggroRange,
        ctx.self.y - this.aggroRange,
        ctx.self.x + this.aggroRange,
        ctx.self.y + this.aggroRange,
        this.queryBuffer,
      )) {
        if (!(target instanceof this.targetCtor) || !target.alive) {
          continue;
        }

        const distanceSquared = this.distanceSquared(
          ctx.self.x,
          ctx.self.y,
          target.x,
          target.y,
        );
        if (
          distanceSquared > this.aggroRangeSquared ||
          distanceSquared >= bestDistanceSquared
        ) {
          continue;
        }

        bestTarget = target;
        bestDistanceSquared = distanceSquared;
      }
      return bestTarget;
    }

    for (const target of instanceTargets) {
      if (!target.alive) {
        continue;
      }
      const distanceSquared = this.distanceSquared(
        ctx.self.x,
        ctx.self.y,
        target.x,
        target.y,
      );
      if (distanceSquared >= bestDistanceSquared) {
        continue;
      }

      bestTarget = target;
      bestDistanceSquared = distanceSquared;
    }

    return bestTarget;
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
