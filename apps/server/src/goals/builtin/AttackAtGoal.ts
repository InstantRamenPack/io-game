import { canAttackTarget } from "@server/combat/combatRules.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";
import { MeleeWeapon } from "@server/items/MeleeWeapon.ts";

/**
 * Melee attack goal that swings one configured weapon slot once a target is in range.
 */
export class AttackAtGoal<
  TSelf extends Entity & GoalActor = Entity & GoalActor,
> extends Goal<TSelf> {
  private readonly weaponSlot: number;

  constructor(priority: number, weaponSlot: number) {
    super(priority, ["attack"]);
    this.weaponSlot = weaponSlot;
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    const weapon = this.resolveWeapon(ctx);
    return this.resolveTargetInRange(ctx, weapon) !== null;
  }

  public override start(_ctx: GoalContext<TSelf>): void {
    // no-op
  }

  public override tick(ctx: GoalContext<TSelf>): void {
    const weapon = this.resolveWeapon(ctx);
    const target = this.resolveTargetInRange(ctx, weapon);
    if (!target) {
      return;
    }

    weapon.hit(
      ctx.world,
      ctx.self,
      Math.atan2(target.y - ctx.self.y, target.x - ctx.self.x),
    );
  }

  public override shouldContinue(ctx: GoalContext<TSelf>): boolean {
    const weapon = this.resolveWeapon(ctx);
    return this.resolveTargetInRange(ctx, weapon) !== null;
  }

  public override stop(_ctx: GoalContext<TSelf>): void {
    // no-op
  }

  private resolveTargetInRange(
    ctx: GoalContext<TSelf>,
    weapon: MeleeWeapon,
  ): Entity | null {
    const { targetId } = ctx.self;
    if (targetId === undefined) {
      return null;
    }

    const target = ctx.world.get(targetId);
    if (!target || !canAttackTarget(ctx.world, ctx.self, target)) {
      return null;
    }

    return weapon.canHitTarget(ctx.world, ctx.self, target) ? target : null;
  }

  private resolveWeapon(ctx: GoalContext<TSelf>): MeleeWeapon {
    const weapon = ctx.self.weapons[this.weaponSlot];
    if (weapon instanceof MeleeWeapon) {
      return weapon;
    }

    throw new Error(
      `AttackAtGoal expected melee weapon in slot ${this.weaponSlot} for ${ctx.self.typeId}.`,
    );
  }
}
