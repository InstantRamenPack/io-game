import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import { goalTargetResolver } from "@server/goals/services/GoalTargetResolver.ts";
import { resolveInterceptPoint } from "@server/goals/math/InterceptSolver.ts";

const KEY_BUILDING_TYPE_IDS = new Set(["tower:comms", "tower:energy"]);

/**
 * Fires a rocket weapon when the target is behind a player-built building.
 * Only claims "attack" so a movement goal can still operate in parallel.
 */
export class RocketAttackGoal<
  TSelf extends Entity & GoalActor = Entity & GoalActor,
> extends Goal<TSelf> {
  private readonly weaponSlot: number;
  private readonly maxRange: number;

  constructor(priority: number, weaponSlot: number, maxRange = 900) {
    super(priority, ["attack"]);
    this.weaponSlot = weaponSlot;
    this.maxRange = maxRange;
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    const target = this.resolveTarget(ctx);
    if (!target) return false;
    const weapon = this.resolveWeapon(ctx);
    const dist = Math.hypot(target.x - ctx.self.x, target.y - ctx.self.y);
    return (
      dist <= this.maxRange &&
      weapon.canHit() &&
      this.isTargetBehindBuilding(ctx, target)
    );
  }

  public override start(_ctx: GoalContext<TSelf>): void {}

  public override tick(ctx: GoalContext<TSelf>): void {
    const target = this.resolveTarget(ctx);
    if (!target) return;

    const weapon = this.resolveWeapon(ctx);
    const aimPoint = resolveInterceptPoint({
      originX: ctx.self.x,
      originY: ctx.self.y,
      targetX: target.x,
      targetY: target.y,
      targetVx: target.vx,
      targetVy: target.vy,
      projectileSpeed: weapon.getProjectileSpeed(),
      leadBlendFactor: 0.4,
    });

    const theta = Math.atan2(aimPoint.y - ctx.self.y, aimPoint.x - ctx.self.x);
    ctx.self.rotation = theta;

    if (weapon.canHitTarget(ctx.world, ctx.self, target)) {
      weapon.hit(ctx.world, ctx.self, theta);
    }
  }

  public override shouldContinue(ctx: GoalContext<TSelf>): boolean {
    const target = this.resolveTarget(ctx);
    if (!target) return false;
    const dist = Math.hypot(target.x - ctx.self.x, target.y - ctx.self.y);
    return dist <= this.maxRange && this.isTargetBehindBuilding(ctx, target);
  }

  public override stop(_ctx: GoalContext<TSelf>): void {}

  private resolveTarget(ctx: GoalContext<TSelf>): Entity | null {
    return goalTargetResolver.resolveTrackedCombatTarget(ctx);
  }

  private resolveWeapon(ctx: GoalContext<TSelf>): RangedWeapon {
    const weapon = ctx.self.weapons[this.weaponSlot];
    if (weapon instanceof RangedWeapon) return weapon;
    throw new Error(
      `RocketAttackGoal expected ranged weapon in slot ${this.weaponSlot}.`,
    );
  }

  private isTargetBehindBuilding(
    ctx: GoalContext<TSelf>,
    target: Entity,
  ): boolean {
    const sx = ctx.self.x;
    const sy = ctx.self.y;
    const tx = target.x;
    const ty = target.y;
    const minX = Math.min(sx, tx) - 10;
    const minY = Math.min(sy, ty) - 10;
    const maxX = Math.max(sx, tx) + 10;
    const maxY = Math.max(sy, ty) + 10;

    for (const blocker of ctx.world.staticGeometry.queryBox(
      minX,
      minY,
      maxX,
      maxY,
    )) {
      const entity = blocker.entity;
      if (!entity.typeId.startsWith("building:")) continue;
      if (KEY_BUILDING_TYPE_IDS.has(entity.typeId)) continue;

      // Check the blocker center is roughly between self and target
      const bx = (blocker.bounds.minX + blocker.bounds.maxX) / 2;
      const by = (blocker.bounds.minY + blocker.bounds.maxY) / 2;
      if (isPointBetween(sx, sy, tx, ty, bx, by)) return true;
    }
    return false;
  }
}

function isPointBetween(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): boolean {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1) return false;
  const t = (apx * abx + apy * aby) / lenSq;
  if (t < 0.05 || t > 0.95) return false;
  // Cross product magnitude — point must be near the line
  const cross = Math.abs(apx * aby - apy * abx);
  return cross / Math.sqrt(lenSq) < 60;
}
