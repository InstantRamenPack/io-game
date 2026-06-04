import { Goal } from "@server/goals/Goal.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { hashInt } from "@shared/math/hashInt.ts";

type WanderDestination = { x: number; y: number };

const DEFAULT_WANDER_RADIUS = 140;
const DEFAULT_ARRIVAL_RADIUS = 12;
const MIN_WAIT_TICKS = 20;
const WAIT_TICK_VARIANCE = 50;
const STEERING_ACCELERATION_MULTIPLIER = 0.18;

/**
 * Idle movement goal that keeps an actor roaming near the spot where it lost aggro.
 */
export class WanderGoal<
  TSelf extends GoalActor = GoalActor,
> extends Goal<TSelf> {
  private readonly wanderRadius: number;
  private readonly arrivalRadius: number;
  private anchorX = 0;
  private anchorY = 0;
  private destination: WanderDestination | null = null;
  private waitUntilTick = 0;

  constructor(
    priority: number,
    options: {
      wanderRadius?: number;
      arrivalRadius?: number;
    } = {},
  ) {
    super(priority, ["move"]);
    this.wanderRadius = options.wanderRadius ?? DEFAULT_WANDER_RADIUS;
    this.arrivalRadius = options.arrivalRadius ?? DEFAULT_ARRIVAL_RADIUS;
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    return this.canWander(ctx);
  }

  public override start(ctx: GoalContext<TSelf>): void {
    this.anchorX = ctx.self.x;
    this.anchorY = ctx.self.y;
    this.destination = null;
    this.waitUntilTick = ctx.world.tick + this.computeWaitTicks(ctx, 0);
    ctx.self.setDesiredVelocity(0, 0);
  }

  public override tick(ctx: GoalContext<TSelf>): void {
    if (!this.canWander(ctx)) {
      this.stop(ctx);
      return;
    }

    if (!this.destination) {
      if (ctx.world.tick < this.waitUntilTick) {
        ctx.self.setDesiredVelocity(0, 0);
        return;
      }
      this.destination = this.pickDestination(ctx);
    }

    const deltaX = this.destination.x - ctx.self.x;
    const deltaY = this.destination.y - ctx.self.y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared <= this.arrivalRadius * this.arrivalRadius) {
      this.destination = null;
      this.waitUntilTick = ctx.world.tick + this.computeWaitTicks(ctx, 1);
      ctx.self.setDesiredVelocity(0, 0);
      return;
    }

    const distance = Math.sqrt(distanceSquared);
    ctx.self.steerTowardVelocity(
      (deltaX / distance) * ctx.self.moveSpeed,
      (deltaY / distance) * ctx.self.moveSpeed,
      Math.max(1.5, ctx.self.moveSpeed * STEERING_ACCELERATION_MULTIPLIER),
    );
  }

  public override shouldContinue(ctx: GoalContext<TSelf>): boolean {
    return this.canWander(ctx);
  }

  public override stop(ctx: GoalContext<TSelf>): void {
    this.destination = null;
    this.waitUntilTick = 0;
    ctx.self.setDesiredVelocity(0, 0);
  }

  private canWander(ctx: GoalContext<TSelf>): boolean {
    return (
      ctx.self.alive &&
      ctx.self.moveSpeed > 0 &&
      ctx.self.targetId === undefined
    );
  }

  private pickDestination(ctx: GoalContext<TSelf>): WanderDestination {
    const distanceFromAnchor = Math.hypot(
      ctx.self.x - this.anchorX,
      ctx.self.y - this.anchorY,
    );
    if (distanceFromAnchor > this.wanderRadius) {
      return { x: this.anchorX, y: this.anchorY };
    }

    const seed = hashInt(ctx.self.id * 73856093 + ctx.world.tick * 19349663);
    const angle = ((seed & 0xffff) / 0x10000) * Math.PI * 2;
    const radius =
      (0.25 + (((seed >>> 16) & 0xff) / 0xff) * 0.75) * this.wanderRadius;
    const destination = {
      x: this.anchorX + Math.cos(angle) * radius,
      y: this.anchorY + Math.sin(angle) * radius,
    };
    return (
      ctx.world.navPathService.getClosestWalkableWorldPoint(
        destination.x,
        destination.y,
      ) ?? destination
    );
  }

  private computeWaitTicks(ctx: GoalContext<TSelf>, salt: number): number {
    const seed = hashInt(
      ctx.self.id * 83492791 + (ctx.world.tick + salt) * 2654435761,
    );
    return MIN_WAIT_TICKS + (seed % WAIT_TICK_VARIANCE);
  }
}
