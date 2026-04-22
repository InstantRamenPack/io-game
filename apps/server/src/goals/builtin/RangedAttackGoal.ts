import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";
import { resolveInterceptPoint } from "@server/goals/math/InterceptSolver.ts";
import { goalTargetResolver } from "@server/goals/services/GoalTargetResolver.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

/**
 * Strafing ranged attack goal that maintains distance while firing one weapon slot.
 */
export class RangedAttackGoal<
  TSelf extends Entity & GoalActor = Entity & GoalActor,
> extends Goal<TSelf> {
  private readonly weaponSlot: number;
  private readonly preferredDistance: number;
  private readonly distanceTolerance: number;
  private readonly strafeSwapTicks: number;
  private readonly leadBlendFactor: number;
  private strafeSign: -1 | 1 = 1;
  private ticksUntilSwap: number;

  constructor(
    priority: number,
    weaponSlot: number,
    preferredDistance = 220,
    distanceTolerance = 32,
    strafeSwapTicks = 45,
    leadBlendFactor = 0.5,
  ) {
    super(priority, ["move", "attack"]);
    this.weaponSlot = weaponSlot;
    this.preferredDistance = preferredDistance;
    this.distanceTolerance = distanceTolerance;
    this.strafeSwapTicks = Math.max(1, strafeSwapTicks);
    this.leadBlendFactor = Math.max(0, leadBlendFactor);
    this.ticksUntilSwap = this.strafeSwapTicks;
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    this.resolveWeapon(ctx);
    return this.resolveTarget(ctx) !== null;
  }

  public override start(_ctx: GoalContext<TSelf>): void {
    this.ticksUntilSwap = this.strafeSwapTicks;
  }

  public override tick(ctx: GoalContext<TSelf>): void {
    const weapon = this.resolveWeapon(ctx);
    const target = this.resolveTarget(ctx);
    if (!target) {
      this.stop(ctx);
      return;
    }

    const deltaX = target.x - ctx.self.x;
    const deltaY = target.y - ctx.self.y;
    const distance = Math.hypot(deltaX, deltaY);
    const aimPoint = this.resolveAimPoint(ctx, weapon, target);
    if (distance <= Number.EPSILON) {
      ctx.self.setDesiredVelocity(0, 0);
      const aimTheta = Math.atan2(
        aimPoint.y - ctx.self.y,
        aimPoint.x - ctx.self.x,
      );
      if (weapon.canHitTarget(ctx.world, ctx.self, target)) {
        weapon.hit(ctx.world, ctx.self, aimTheta);
      }
      return;
    }

    const aimTheta = Math.atan2(
      aimPoint.y - ctx.self.y,
      aimPoint.x - ctx.self.x,
    );
    ctx.self.rotation = aimTheta;
    this.ticksUntilSwap -= 1;
    if (this.ticksUntilSwap <= 0) {
      this.flipStrafeDirection();
    }

    const directionX = deltaX / distance;
    const directionY = deltaY / distance;
    const minDistance = Math.max(
      0,
      this.preferredDistance - this.distanceTolerance,
    );
    const maxDistance = this.preferredDistance + this.distanceTolerance;

    if (distance > maxDistance) {
      ctx.self.setDesiredVelocity(
        directionX * ctx.self.moveSpeed,
        directionY * ctx.self.moveSpeed,
      );
    } else if (distance < minDistance) {
      ctx.self.setDesiredVelocity(
        -directionX * ctx.self.moveSpeed,
        -directionY * ctx.self.moveSpeed,
      );
    } else {
      const strafeVector = this.resolveStrafeVector(
        ctx,
        directionX,
        directionY,
      );
      ctx.self.setDesiredVelocity(
        strafeVector.x * ctx.self.moveSpeed,
        strafeVector.y * ctx.self.moveSpeed,
      );
    }

    if (weapon.canHitTarget(ctx.world, ctx.self, target)) {
      weapon.hit(ctx.world, ctx.self, aimTheta);
    }
  }

  public override shouldContinue(ctx: GoalContext<TSelf>): boolean {
    this.resolveWeapon(ctx);
    return this.resolveTarget(ctx) !== null;
  }

  public override stop(ctx: GoalContext<TSelf>): void {
    this.ticksUntilSwap = this.strafeSwapTicks;
    ctx.self.setDesiredVelocity(0, 0);
  }

  private resolveTarget(ctx: GoalContext<TSelf>): Entity | null {
    return goalTargetResolver.resolveTrackedCombatTarget(ctx);
  }

  private resolveWeapon(ctx: GoalContext<TSelf>): RangedWeapon {
    const weapon = ctx.self.weapons[this.weaponSlot];
    if (weapon instanceof RangedWeapon) {
      return weapon;
    }

    throw new Error(
      `RangedAttackGoal expected ranged weapon in slot ${this.weaponSlot} for ${ctx.self.typeId}.`,
    );
  }

  private resolveAimPoint(
    ctx: GoalContext<TSelf>,
    weapon: RangedWeapon,
    target: Entity,
  ): { x: number; y: number } {
    return resolveInterceptPoint({
      originX: ctx.self.x,
      originY: ctx.self.y,
      targetX: target.x,
      targetY: target.y,
      targetVx: target.vx,
      targetVy: target.vy,
      projectileSpeed: weapon.getProjectileSpeed(),
      leadBlendFactor: this.leadBlendFactor,
    });
  }

  private resolveStrafeVector(
    ctx: GoalContext<TSelf>,
    directionX: number,
    directionY: number,
  ): { x: number; y: number } {
    let strafeX = -directionY * this.strafeSign;
    let strafeY = directionX * this.strafeSign;

    if (!this.wouldStayWithinBounds(ctx, strafeX, strafeY)) {
      this.flipStrafeDirection();
      strafeX = -directionY * this.strafeSign;
      strafeY = directionX * this.strafeSign;
      if (!this.wouldStayWithinBounds(ctx, strafeX, strafeY)) {
        return { x: 0, y: 0 };
      }
    }

    return { x: strafeX, y: strafeY };
  }

  private wouldStayWithinBounds(
    ctx: GoalContext<TSelf>,
    directionX: number,
    directionY: number,
  ): boolean {
    const nextX = ctx.self.x + directionX * ctx.self.moveSpeed;
    const nextY = ctx.self.y + directionY * ctx.self.moveSpeed;
    const bounds = ctx.self.getHitboxBounds();
    const minX = -bounds.minX;
    const minY = -bounds.minY;
    const maxX = ctx.world.gameConfig.worldSize.w - bounds.maxX;
    const maxY = ctx.world.gameConfig.worldSize.h - bounds.maxY;

    return nextX >= minX && nextX <= maxX && nextY >= minY && nextY <= maxY;
  }

  private flipStrafeDirection(): void {
    this.strafeSign = this.strafeSign === 1 ? -1 : 1;
    this.ticksUntilSwap = this.strafeSwapTicks;
  }
}
