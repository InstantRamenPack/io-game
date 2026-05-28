import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import { goalTargetResolver } from "@server/goals/services/GoalTargetResolver.ts";

/**
 * Fires a ranged weapon in a burst once every cooldownTicks at any distance.
 * The goal activates for a single tick, fires, then sleeps until the next interval.
 */
export class SprayAttackGoal<
  TSelf extends Entity & GoalActor = Entity & GoalActor,
> extends Goal<TSelf> {
  private readonly weaponSlot: number;
  private readonly intervalTicks: number;
  private ticksUntilNextSpray: number;

  constructor(priority: number, weaponSlot: number, intervalTicks = 200) {
    super(priority, ["attack"]);
    this.weaponSlot = weaponSlot;
    this.intervalTicks = intervalTicks;
    this.ticksUntilNextSpray = intervalTicks;
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    if (this.ticksUntilNextSpray > 0) {
      this.ticksUntilNextSpray--;
      return false;
    }
    return this.resolveTarget(ctx) !== null;
  }

  public override start(_ctx: GoalContext<TSelf>): void {}

  public override tick(ctx: GoalContext<TSelf>): void {
    const target = this.resolveTarget(ctx);
    if (!target) return;

    const weapon = this.resolveWeapon(ctx);
    const theta = Math.atan2(target.y - ctx.self.y, target.x - ctx.self.x);
    ctx.self.rotation = theta;
    weapon.hit(ctx.world, ctx.self, theta);
    this.ticksUntilNextSpray = this.intervalTicks;
  }

  public override shouldContinue(_ctx: GoalContext<TSelf>): boolean {
    return false;
  }

  public override stop(_ctx: GoalContext<TSelf>): void {}

  private resolveTarget(ctx: GoalContext<TSelf>): Entity | null {
    return goalTargetResolver.resolveTrackedCombatTarget(ctx);
  }

  private resolveWeapon(ctx: GoalContext<TSelf>): RangedWeapon {
    const weapon = ctx.self.weapons[this.weaponSlot];
    if (weapon instanceof RangedWeapon) {
      return weapon;
    }
    throw new Error(
      `SprayAttackGoal expected ranged weapon in slot ${this.weaponSlot} for ${ctx.self.typeId}.`,
    );
  }
}
