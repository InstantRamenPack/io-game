import type { Entity } from "@server/entities/Entity.ts";
import type { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";

type TargetEntityCtor = abstract new (...args: never[]) => Entity;

/**
 * Maintains the nearest valid target instance for the acting goal-controlled entity.
 */
export class TargetEntityGoal<
  TSelf extends GoalControlledEntity = GoalControlledEntity,
> extends Goal<TSelf> {
  private readonly targetCtor: TargetEntityCtor;
  private readonly aggroRange: number;

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

    const aggroRangeSquared = this.aggroRange * this.aggroRange;
    let bestTarget: Entity | null = null;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const target of ctx.world.entities.queryInstances(this.targetCtor)) {
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
        distanceSquared > aggroRangeSquared ||
        distanceSquared >= bestDistanceSquared
      ) {
        continue;
      }

      bestTarget = target;
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
    const aggroRangeSquared = this.aggroRange * this.aggroRange;
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
