import { Building } from "@server/entities/Building.ts";
import type { Enemy } from "@server/entities/Enemy.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";

type CombatTargetGoalOptions = {
  requireLineOfSight?: boolean;
};

const INSTANCE_SCAN_TARGET_LIMIT = 64;
const HIDDEN_TARGET_AGGRO_GRACE_TICKS = 100;
const AGGRO_RETENTION_RADIUS_MULTIPLIER = 1.5;

/**
 * Shared player-first, building-fallback targeting for generic combat enemies.
 */
export function createCombatTargetGoals(
  priority: number,
  aggroRange: number,
  options?: CombatTargetGoalOptions,
): readonly CombatTargetEntityGoal[] {
  return [
    new CombatTargetEntityGoal(priority, aggroRange, {
      requireLineOfSight: options?.requireLineOfSight ?? true,
    }),
  ];
}

/**
 * Single-scan hostile target acquisition with player priority over buildings.
 */
export class CombatTargetEntityGoal extends Goal<Enemy> {
  private readonly aggroRange: number;
  private readonly aggroRangeSquared: number;
  private readonly aggroRetentionRangeSquared: number;
  private readonly requireLineOfSight: boolean;
  private readonly queryBuffer: Entity[] = [];
  private cachedResolutionTick = -1;
  private cachedTarget: Entity | null = null;
  private hiddenTargetId: number | undefined;
  private hiddenTargetSinceTick: number | undefined;

  constructor(
    priority: number,
    aggroRange: number,
    options?: CombatTargetGoalOptions,
  ) {
    super(priority, ["target"]);
    this.aggroRange = aggroRange;
    this.aggroRangeSquared = Number.isFinite(aggroRange)
      ? aggroRange * aggroRange
      : Number.POSITIVE_INFINITY;
    this.aggroRetentionRangeSquared = Number.isFinite(aggroRange)
      ? (aggroRange * AGGRO_RETENTION_RADIUS_MULTIPLIER) ** 2
      : Number.POSITIVE_INFINITY;
    this.requireLineOfSight = options?.requireLineOfSight ?? false;
  }

  public override canStart(_ctx: GoalContext<Enemy>): boolean {
    return this.resolveTargetCandidate(_ctx) !== null;
  }

  public override start(_ctx: GoalContext<Enemy>): void {
    // no-op for continuous targeting
  }

  public override tick(ctx: GoalContext<Enemy>): void {
    ctx.self.targetId = this.resolveTargetCandidate(ctx)?.id;
  }

  public override shouldContinue(ctx: GoalContext<Enemy>): boolean {
    return this.resolveTargetCandidate(ctx) !== null;
  }

  public override stop(ctx: GoalContext<Enemy>): void {
    ctx.self.targetId = undefined;
    this.clearHiddenTarget();
  }

  private resolveTargetCandidate(ctx: GoalContext<Enemy>): Entity | null {
    if (this.cachedResolutionTick === ctx.world.tick) {
      return this.cachedTarget;
    }

    const resolvedTarget =
      this.resolveValidTarget(ctx, ctx.self.targetId) ??
      this.findNearestHostileTargetInRange(ctx);
    this.cachedResolutionTick = ctx.world.tick;
    this.cachedTarget = resolvedTarget;
    return resolvedTarget;
  }

  private resolveValidTarget(
    ctx: GoalContext<Enemy>,
    targetId: number | undefined,
  ): Entity | null {
    if (targetId === undefined) {
      return null;
    }

    const target = ctx.world.get(targetId);
    if (!this.isHostileTarget(ctx, target)) {
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

  private findNearestHostileTargetInRange(
    ctx: GoalContext<Enemy>,
  ): Entity | null {
    const candidates = this.queryHostileCandidates(ctx);
    let bestPlayer: Entity | null = null;
    let bestPlayerDistanceSquared = Number.POSITIVE_INFINITY;
    let bestBuilding: Entity | null = null;
    let bestBuildingDistanceSquared = Number.POSITIVE_INFINITY;

    for (const target of candidates) {
      if (!this.isHostileTarget(ctx, target)) {
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
        !ctx.world.goalFieldCache.canSeeTarget(
          ctx,
          target,
          this.requireLineOfSight,
        )
      ) {
        continue;
      }

      if (target instanceof Player) {
        if (distanceSquared < bestPlayerDistanceSquared) {
          bestPlayer = target;
          bestPlayerDistanceSquared = distanceSquared;
        }
        continue;
      }

      if (
        target instanceof Building &&
        distanceSquared < bestBuildingDistanceSquared
      ) {
        bestBuilding = target;
        bestBuildingDistanceSquared = distanceSquared;
      }
    }

    return bestPlayer ?? bestBuilding;
  }

  private queryHostileCandidates(ctx: GoalContext<Enemy>): readonly Entity[] {
    const players = ctx.world.entities.queryInstances(Player);
    const buildings = ctx.world.entities.queryInstances(Building);
    const instanceTargetCount = players.length + buildings.length;

    if (instanceTargetCount <= INSTANCE_SCAN_TARGET_LIMIT) {
      return [...players, ...buildings];
    }

    if (!Number.isFinite(this.aggroRange)) {
      return [...players, ...buildings];
    }

    return ctx.world.spatial.queryBox(
      ctx.self.x - this.aggroRange,
      ctx.self.y - this.aggroRange,
      ctx.self.x + this.aggroRange,
      ctx.self.y + this.aggroRange,
      this.queryBuffer,
    );
  }

  private isHostileTarget(
    ctx: GoalContext<Enemy>,
    target: Entity | undefined,
  ): target is Entity {
    return (
      target !== undefined &&
      target.alive &&
      (target instanceof Player || target instanceof Building) &&
      DamageEffect.canApply(ctx.world, ctx.self, target)
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

  private canRetainTrackedTarget(
    ctx: GoalContext<Enemy>,
    target: Entity,
  ): boolean {
    if (
      !this.requireLineOfSight ||
      ctx.world.goalFieldCache.canSeeTarget(
        ctx,
        target,
        this.requireLineOfSight,
      )
    ) {
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
