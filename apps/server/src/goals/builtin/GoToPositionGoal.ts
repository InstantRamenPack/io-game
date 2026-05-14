import { Goal } from "@server/goals/Goal.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";

export type GoalDestination = { x: number; y: number };
type GoalDestinationProvider<TSelf extends GoalActor> = (
  ctx: GoalContext<TSelf>,
) => GoalDestination | null;
type TilePoint = { x: number; y: number };

const DEFAULT_REPATH_INTERVAL_TICKS = 6;
const REPATH_STAGGER_TICKS = 3;
const WAYPOINT_REACHED_DISTANCE_SQUARED = 16;
const STEERING_JITTER_TICKS = 18;
const STEERING_JITTER_RADIUS = 5;
const STEERING_ACCELERATION_MULTIPLIER = 0.22;

/**
 * Straight-line movement goal that walks toward a computed destination.
 */
export class GoToPositionGoal<
  TSelf extends GoalActor = GoalActor,
> extends Goal<TSelf> {
  private readonly destinationProvider: GoalDestinationProvider<TSelf>;
  private readonly arrivalRadius: number;
  private readonly repathIntervalTicks: number;
  private cachedWaypoint: GoalDestination | null = null;
  private hasPathSample = false;
  private lastRepathTick = Number.NEGATIVE_INFINITY;
  private nextScheduledRepathTick = Number.NEGATIVE_INFINITY;
  private lastDestinationTile: TilePoint | null = null;

  /**
   * Creates a reusable direct-steering goal toward a world position.
   * @param priority Lower values run first.
   * @param destinationProvider Produces the desired destination for this tick.
   * @param arrivalRadius Distance at which the destination counts as reached.
   */
  constructor(
    priority: number,
    destinationProvider: GoalDestinationProvider<TSelf>,
    arrivalRadius: number,
  ) {
    super(priority, ["move"]);
    this.destinationProvider = destinationProvider;
    this.arrivalRadius = arrivalRadius;
    this.repathIntervalTicks = DEFAULT_REPATH_INTERVAL_TICKS;
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    return !this.hasArrived(ctx);
  }

  public override start(_ctx: GoalContext<TSelf>): void {
    this.clearPathState();
  }

  public override tick(ctx: GoalContext<TSelf>): void {
    const destination = this.destinationProvider(ctx);
    if (!destination) {
      this.stop(ctx);
      return;
    }

    const deltaX = destination.x - ctx.self.x;
    const deltaY = destination.y - ctx.self.y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    const arrivalDistanceSquared = this.arrivalRadius * this.arrivalRadius;
    if (distanceSquared <= arrivalDistanceSquared) {
      this.stop(ctx);
      return;
    }

    const destinationTile = ctx.world.navPathService.toTileCoordinate(
      destination.x,
      destination.y,
    );
    const shouldRepath = this.shouldRepath(ctx, destinationTile);
    if (shouldRepath) {
      this.cachedWaypoint = ctx.world.navPathService.getNextWaypoint(
        ctx.self.x,
        ctx.self.y,
        destination.x,
        destination.y,
      );
      this.hasPathSample = true;
      this.lastRepathTick = ctx.world.tick;
      this.nextScheduledRepathTick = this.computeNextScheduledRepathTick(ctx);
      this.lastDestinationTile = destinationTile;
    }

    const waypoint = this.cachedWaypoint;
    if (!waypoint) {
      ctx.self.setDesiredVelocity(0, 0);
      return;
    }
    const steeringTarget = this.addSteeringJitter(ctx, waypoint);
    const waypointDeltaX = steeringTarget.x - ctx.self.x;
    const waypointDeltaY = steeringTarget.y - ctx.self.y;
    const waypointDistanceSquared =
      waypointDeltaX * waypointDeltaX + waypointDeltaY * waypointDeltaY;
    const distance = Math.sqrt(waypointDistanceSquared);
    if (distance <= Number.EPSILON) {
      this.hasPathSample = false;
      this.cachedWaypoint = null;
      ctx.self.setDesiredVelocity(0, 0);
      return;
    }

    ctx.self.steerTowardVelocity(
      (waypointDeltaX / distance) * ctx.self.moveSpeed,
      (waypointDeltaY / distance) * ctx.self.moveSpeed,
      Math.max(1.5, ctx.self.moveSpeed * STEERING_ACCELERATION_MULTIPLIER),
    );
  }

  public override shouldContinue(ctx: GoalContext<TSelf>): boolean {
    return !this.hasArrived(ctx);
  }

  public override stop(ctx: GoalContext<TSelf>): void {
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
    const waypointDistanceSquared =
      waypointDeltaX * waypointDeltaX + waypointDeltaY * waypointDeltaY;
    return waypointDistanceSquared <= WAYPOINT_REACHED_DISTANCE_SQUARED;
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

  private addSteeringJitter(
    ctx: GoalContext<TSelf>,
    waypoint: GoalDestination,
  ): GoalDestination {
    const phase = Math.floor(ctx.world.tick / STEERING_JITTER_TICKS);
    const seed = hashInt(ctx.self.id * 73856093 + phase * 19349663);
    const angle = ((seed & 0xffff) / 0x10000) * Math.PI * 2;
    const radius = (((seed >>> 16) & 0xff) / 0xff) * STEERING_JITTER_RADIUS;
    return {
      x: waypoint.x + Math.cos(angle) * radius,
      y: waypoint.y + Math.sin(angle) * radius,
    };
  }

  private hasArrived(ctx: GoalContext<TSelf>): boolean {
    const destination = this.destinationProvider(ctx);
    if (!destination) {
      return true;
    }

    const deltaX = destination.x - ctx.self.x;
    const deltaY = destination.y - ctx.self.y;
    const arrivalDistanceSquared = this.arrivalRadius * this.arrivalRadius;
    return deltaX * deltaX + deltaY * deltaY <= arrivalDistanceSquared;
  }
}

function hashInt(value: number): number {
  let hash = value | 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}
