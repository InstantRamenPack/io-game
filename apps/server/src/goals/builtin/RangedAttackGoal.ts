import { canAttackTarget } from "@server/combat/combatRules.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

const LEAD_BLEND_FACTOR = 0.5;

/**
 * Strafing ranged attack goal that maintains distance while firing one weapon slot.
 */
export class RangedAttackGoal<
  TSelf extends GoalControlledEntity = GoalControlledEntity,
> extends Goal<TSelf> {
  private readonly weaponSlot: number;
  private readonly preferredDistance: number;
  private readonly distanceTolerance: number;
  private readonly strafeSwapTicks: number;
  private strafeSign: -1 | 1 = 1;
  private ticksUntilSwap: number;

  constructor(
    priority: number,
    weaponSlot: number,
    preferredDistance = 220,
    distanceTolerance = 32,
    strafeSwapTicks = 45,
  ) {
    super(priority, ["move", "attack"]);
    this.weaponSlot = weaponSlot;
    this.preferredDistance = preferredDistance;
    this.distanceTolerance = distanceTolerance;
    this.strafeSwapTicks = Math.max(1, strafeSwapTicks);
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
      if (weapon.canHitTarget(ctx.world, ctx.self, target)) {
        weapon.hit(ctx.world, ctx.self, aimPoint.x, aimPoint.y);
      }
      return;
    }

    ctx.self.rotation = Math.atan2(
      aimPoint.y - ctx.self.y,
      aimPoint.x - ctx.self.x,
    );
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
      weapon.hit(ctx.world, ctx.self, aimPoint.x, aimPoint.y);
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
    const { targetId } = ctx.self;
    if (targetId === undefined) {
      return null;
    }

    const target = ctx.world.get(targetId);
    if (!target || !target.alive) {
      return null;
    }
    if (!canAttackTarget(ctx.world, ctx.self, target)) {
      return null;
    }

    return target;
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
    const projectileSpeed = weapon.getProjectileSpeed();
    const interceptTime = this.resolveInterceptTime(
      ctx.self.x,
      ctx.self.y,
      target.x,
      target.y,
      target.vx,
      target.vy,
      projectileSpeed,
    );
    if (interceptTime === null) {
      return { x: target.x, y: target.y };
    }

    return {
      x: target.x + target.vx * interceptTime * LEAD_BLEND_FACTOR,
      y: target.y + target.vy * interceptTime * LEAD_BLEND_FACTOR,
    };
  }

  private resolveInterceptTime(
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    targetVx: number,
    targetVy: number,
    projectileSpeed: number,
  ): number | null {
    if (!Number.isFinite(projectileSpeed) || projectileSpeed <= 0) {
      return null;
    }

    const relativeX = targetX - originX;
    const relativeY = targetY - originY;
    const targetSpeedSquared = targetVx * targetVx + targetVy * targetVy;
    const projectileSpeedSquared = projectileSpeed * projectileSpeed;
    const quadraticA = targetSpeedSquared - projectileSpeedSquared;
    const quadraticB = 2 * (relativeX * targetVx + relativeY * targetVy);
    const quadraticC = relativeX * relativeX + relativeY * relativeY;

    if (Math.abs(quadraticA) <= 1e-6) {
      if (Math.abs(quadraticB) <= 1e-6) {
        return null;
      }

      const linearTime = -quadraticC / quadraticB;
      return linearTime > 0 ? linearTime : null;
    }

    const discriminant = quadraticB * quadraticB - 4 * quadraticA * quadraticC;
    if (discriminant < 0) {
      return null;
    }

    const discriminantRoot = Math.sqrt(discriminant);
    const firstTime = (-quadraticB - discriminantRoot) / (2 * quadraticA);
    const secondTime = (-quadraticB + discriminantRoot) / (2 * quadraticA);
    const positiveTimes = [firstTime, secondTime].filter((time) => time > 0);

    if (positiveTimes.length === 0) {
      return null;
    }

    return Math.min(...positiveTimes);
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
