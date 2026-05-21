import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";

type EntityCtor<T extends Entity> = abstract new (...args: never[]) => T;

/**
 * Shared target resolution helpers for server AI goals.
 */
export class GoalTargetResolver {
  private toCombatEntity(actor: GoalActor): Entity {
    return actor as unknown as Entity;
  }

  public resolveTrackedLivingTarget<
    TSelf extends GoalActor,
    TTarget extends Entity = Entity,
  >(ctx: GoalContext<TSelf>, targetCtor?: EntityCtor<TTarget>): TTarget | null {
    const { targetId } = ctx.self;
    if (targetId === undefined) {
      return null;
    }

    const target = ctx.world.get(targetId);
    if (!target || !target.alive) {
      return null;
    }
    if (targetCtor && !(target instanceof targetCtor)) {
      return null;
    }

    return target as TTarget;
  }

  public resolveTrackedCombatTarget<TSelf extends GoalActor>(
    ctx: GoalContext<TSelf>,
  ): Entity | null {
    const target = this.resolveTrackedLivingTarget(ctx);
    if (!target) {
      return null;
    }
    return DamageEffect.canApply(
      ctx.world,
      this.toCombatEntity(ctx.self),
      target,
    )
      ? target
      : null;
  }

  public resolveTrackedCombatTargetOfType<
    TSelf extends GoalActor,
    TTarget extends Entity,
  >(ctx: GoalContext<TSelf>, targetCtor: EntityCtor<TTarget>): TTarget | null {
    const target = this.resolveTrackedLivingTarget(ctx, targetCtor);
    if (!target) {
      return null;
    }
    return DamageEffect.canApply(
      ctx.world,
      this.toCombatEntity(ctx.self),
      target,
    )
      ? target
      : null;
  }

  public findNearestCombatTargetInRange<TSelf extends GoalActor>(
    ctx: GoalContext<TSelf>,
    seekRadius: number,
    queryBuffer?: Entity[],
  ): Entity | null {
    let bestTarget: Entity | null = null;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;
    const seekRadiusSquared = seekRadius * seekRadius;
    const buffer = queryBuffer ?? [];

    for (const candidate of ctx.world.spatial.queryBox(
      ctx.self.x - seekRadius,
      ctx.self.y - seekRadius,
      ctx.self.x + seekRadius,
      ctx.self.y + seekRadius,
      buffer,
    )) {
      if (
        !candidate.alive ||
        !DamageEffect.canApply(
          ctx.world,
          this.toCombatEntity(ctx.self),
          candidate,
        )
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
        distanceSquared > seekRadiusSquared ||
        distanceSquared >= bestDistanceSquared
      ) {
        continue;
      }

      bestTarget = candidate;
      bestDistanceSquared = distanceSquared;
    }

    return bestTarget;
  }

  public isWithinRange(
    sourceX: number,
    sourceY: number,
    target: Entity,
    rangeSquared: number,
  ): boolean {
    return (
      this.distanceSquared(sourceX, sourceY, target.x, target.y) <= rangeSquared
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

export const goalTargetResolver = new GoalTargetResolver();
