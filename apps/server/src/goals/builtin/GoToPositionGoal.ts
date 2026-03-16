import { Goal } from "@server/goals/Goal.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";

export type GoalDestination = { x: number; y: number };
export type GoalDestinationProvider = (
  ctx: GoalContext,
) => GoalDestination | null;

/**
 * Straight-line movement goal that walks toward a computed destination.
 */
export class GoToPositionGoal extends Goal {
  private readonly destinationProvider: GoalDestinationProvider;
  private readonly arrivalRadius: number;

  /**
   * Creates a reusable direct-steering goal toward a world position.
   * @param priority Lower values run first.
   * @param destinationProvider Produces the desired destination for this tick.
   * @param arrivalRadius Distance at which the destination counts as reached.
   */
  constructor(
    priority: number,
    destinationProvider: GoalDestinationProvider,
    arrivalRadius: number,
  ) {
    super(priority, ["move"]);
    this.destinationProvider = destinationProvider;
    this.arrivalRadius = arrivalRadius;
  }

  override canStart(ctx: GoalContext): boolean {
    return !this.hasArrived(ctx);
  }

  override start(_ctx: GoalContext): void {
    // no-op for direct steering
  }

  override tick(ctx: GoalContext): void {
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

    const distance = Math.sqrt(distanceSquared);
    if (distance <= Number.EPSILON) {
      this.stop(ctx);
      return;
    }

    ctx.self.setMovementVelocity(
      (deltaX / distance) * ctx.self.moveSpeed,
      (deltaY / distance) * ctx.self.moveSpeed,
    );
  }

  override shouldContinue(ctx: GoalContext): boolean {
    return !this.hasArrived(ctx);
  }

  override stop(ctx: GoalContext): void {
    ctx.self.setMovementVelocity(0, 0);
  }

  private hasArrived(ctx: GoalContext): boolean {
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
