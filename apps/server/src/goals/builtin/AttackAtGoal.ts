import type { Entity } from "@server/entities/Entity.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";

/**
 * Melee attack goal that swings the enemy's equipped weapon once a target is in range.
 */
export class AttackAtGoal extends Goal {
  constructor(priority: number) {
    super(priority, ["attack"]);
  }

  override canStart(ctx: GoalContext): boolean {
    return this.resolveTargetInRange(ctx) !== null;
  }

  override start(_ctx: GoalContext): void {
    // no-op
  }

  override tick(ctx: GoalContext): void {
    const target = this.resolveTargetInRange(ctx);
    if (!target) {
      return;
    }

    ctx.self.meleeWeapon?.tryAttackEntity(ctx.world, ctx.self, target);
  }

  override shouldContinue(ctx: GoalContext): boolean {
    return this.resolveTargetInRange(ctx) !== null;
  }

  override stop(_ctx: GoalContext): void {
    // no-op
  }

  private resolveTargetInRange(ctx: GoalContext): Entity | null {
    const { targetId, meleeWeapon } = ctx.self;
    if (targetId === undefined || !meleeWeapon) {
      return null;
    }

    const target = ctx.world.get(targetId);
    if (!target || !ctx.world.canAttackTarget(ctx.self, target)) {
      return null;
    }

    return meleeWeapon.isTargetInRange(ctx.self, target) ? target : null;
  }
}
