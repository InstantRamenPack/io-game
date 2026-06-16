import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";
import { resolveInterceptPoint } from "@server/goals/math/InterceptSolver.ts";
import { goalTargetResolver } from "@server/goals/services/GoalTargetResolver.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

type TilePoint = { x: number; y: number };
type Waypoint = { x: number; y: number };

const DEFAULT_REPATH_INTERVAL_TICKS = 6;
const REPATH_STAGGER_TICKS = 3;
const WAYPOINT_REACHED_DISTANCE_SQUARED = 16;

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
  private readonly maxFireDistance: number;
  private strafeSign: -1 | 1 = 1;
  private ticksUntilSwap: number;
  private readonly repathIntervalTicks = DEFAULT_REPATH_INTERVAL_TICKS;
  private cachedWaypoint: Waypoint | null = null;
  private hasPathSample = false;
  private lastRepathTick = Number.NEGATIVE_INFINITY;
  private nextScheduledRepathTick = Number.NEGATIVE_INFINITY;
  private lastDestinationTile: TilePoint | null = null;

  constructor(
    priority: number,
    weaponSlot: number,
    preferredDistance = 220,
    distanceTolerance = 32,
    strafeSwapTicks = 45,
    leadBlendFactor = 0.5,
    maxFireDistance = Infinity,
  ) {
    super(priority, ["move", "attack"]);
    this.weaponSlot = weaponSlot;
    this.preferredDistance = preferredDistance;
    this.distanceTolerance = distanceTolerance;
    this.strafeSwapTicks = Math.max(1, strafeSwapTicks);
    this.leadBlendFactor = Math.max(0, leadBlendFactor);
    this.maxFireDistance = maxFireDistance;
    this.ticksUntilSwap = this.strafeSwapTicks;
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    this.resolveWeapon(ctx);
    return this.resolveTarget(ctx) !== null;
  }

  public override start(_ctx: GoalContext<TSelf>): void {
    this.ticksUntilSwap = this.strafeSwapTicks;
    this.clearPathState();
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
      if (this.canFireAtTarget(ctx, weapon, target)) {
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
      const destinationTile = ctx.world.navPathService.toTileCoordinate(
        target.x,
        target.y,
      );
      if (this.shouldRepath(ctx, destinationTile)) {
        this.cachedWaypoint = ctx.world.goalFieldCache.getCachedWaypoint(
          ctx,
          target.x,
          target.y,
          () =>
            ctx.world.navPathService.getNextWaypoint(
              ctx.self.x,
              ctx.self.y,
              target.x,
              target.y,
            ),
        );
        this.hasPathSample = true;
        this.lastRepathTick = ctx.world.tick;
        this.nextScheduledRepathTick = this.computeNextScheduledRepathTick(ctx);
        this.lastDestinationTile = destinationTile;
      }
      const waypoint = this.cachedWaypoint ?? target;
      const pathDx = waypoint.x - ctx.self.x;
      const pathDy = waypoint.y - ctx.self.y;
      const pathDist = Math.hypot(pathDx, pathDy);
      if (pathDist > Number.EPSILON) {
        ctx.self.setDesiredVelocity(
          (pathDx / pathDist) * ctx.self.moveSpeed,
          (pathDy / pathDist) * ctx.self.moveSpeed,
        );
      } else {
        ctx.self.setDesiredVelocity(0, 0);
      }
    } else if (distance < minDistance) {
      this.clearPathState();
      ctx.self.setDesiredVelocity(
        -directionX * ctx.self.moveSpeed,
        -directionY * ctx.self.moveSpeed,
      );
    } else {
      this.clearPathState();
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

    if (this.canFireAtTarget(ctx, weapon, target)) {
      weapon.hit(ctx.world, ctx.self, aimTheta);
    }
  }

  public override shouldContinue(ctx: GoalContext<TSelf>): boolean {
    this.resolveWeapon(ctx);
    return this.resolveTarget(ctx) !== null;
  }

  public override stop(ctx: GoalContext<TSelf>): void {
    this.ticksUntilSwap = this.strafeSwapTicks;
    this.clearPathState();
    ctx.self.setDesiredVelocity(0, 0);
  }

  private shouldRepath(
    ctx: GoalContext<TSelf>,
    destinationTile: TilePoint,
  ): boolean {
    if (!this.hasPathSample) {
      return true;
    }
    if (this.hasReachedCachedWaypoint(ctx)) {
      return true;
    }
    if (
      !this.lastDestinationTile ||
      this.lastDestinationTile.x !== destinationTile.x ||
      this.lastDestinationTile.y !== destinationTile.y
    ) {
      return true;
    }
    if (ctx.world.tick < this.nextScheduledRepathTick) {
      return false;
    }
    if (ctx.world.tick - this.lastRepathTick >= this.repathIntervalTicks) {
      return true;
    }
    return false;
  }

  private hasReachedCachedWaypoint(ctx: GoalContext<TSelf>): boolean {
    if (!this.cachedWaypoint) {
      return false;
    }
    const waypointDeltaX = this.cachedWaypoint.x - ctx.self.x;
    const waypointDeltaY = this.cachedWaypoint.y - ctx.self.y;
    return (
      waypointDeltaX * waypointDeltaX + waypointDeltaY * waypointDeltaY <=
      WAYPOINT_REACHED_DISTANCE_SQUARED
    );
  }

  private clearPathState(): void {
    this.hasPathSample = false;
    this.cachedWaypoint = null;
    this.lastDestinationTile = null;
    this.lastRepathTick = Number.NEGATIVE_INFINITY;
    this.nextScheduledRepathTick = Number.NEGATIVE_INFINITY;
  }

  private computeNextScheduledRepathTick(ctx: GoalContext<TSelf>): number {
    return (
      ctx.world.tick +
      this.repathIntervalTicks +
      (ctx.self.id % REPATH_STAGGER_TICKS)
    );
  }

  private resolveTarget(ctx: GoalContext<TSelf>): Entity | null {
    return goalTargetResolver.resolveTrackedCombatTarget(ctx);
  }

  private canFireAtTarget(
    ctx: GoalContext<TSelf>,
    weapon: RangedWeapon,
    target: Entity,
  ): boolean {
    return (
      Math.hypot(target.x - ctx.self.x, target.y - ctx.self.y) <=
        this.maxFireDistance && weapon.canHitTarget(ctx.world, ctx.self, target)
    );
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
