import { Building } from "@server/entities/Building.ts";
import type { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { Goal } from "@server/goals/Goal.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";

/**
 * Targeting goal that prioritizes buildings above all else.
 * Falls back to the nearest player only when no alive buildings exist.
 */
export class TargetBuildingOrPlayerGoal<
  TSelf extends GoalControlledEntity = GoalControlledEntity,
> extends Goal<TSelf> {
  private readonly aggroRange: number;

  constructor(priority: number, aggroRange: number) {
    super(priority, ["target"]);
    this.aggroRange = aggroRange;
  }

  override canStart(_ctx: GoalContext<TSelf>): boolean {
    return true;
  }

  override start(_ctx: GoalContext<TSelf>): void {}

  override tick(ctx: GoalContext<TSelf>): void {
    // Keep current target if it's still a valid alive building
    if (ctx.self.targetId !== undefined) {
      const current = ctx.world.get(ctx.self.targetId);
      if (current instanceof Building && current.alive) {
        return;
      }
    }

    // Find nearest alive building anywhere on the map
    let bestTarget = null;
    let bestDistSq = Number.POSITIVE_INFINITY;

    for (const building of ctx.world.entities.queryInstances(Building)) {
      if (!building.alive) continue;
      const dx = building.x - ctx.self.x;
      const dy = building.y - ctx.self.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestTarget = building;
        bestDistSq = distSq;
      }
    }

    if (bestTarget) {
      ctx.self.targetId = bestTarget.id;
      return;
    }

    // No buildings — fall back to nearest player within aggro range
    const aggroRangeSq = this.aggroRange * this.aggroRange;
    bestDistSq = Number.POSITIVE_INFINITY;
    let bestPlayer = null;

    for (const player of ctx.world.entities.queryInstances(Player)) {
      if (!player.alive) continue;
      const dx = player.x - ctx.self.x;
      const dy = player.y - ctx.self.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= aggroRangeSq && distSq < bestDistSq) {
        bestPlayer = player;
        bestDistSq = distSq;
      }
    }

    ctx.self.targetId = bestPlayer?.id;
  }

  override shouldContinue(_ctx: GoalContext<TSelf>): boolean {
    return true;
  }

  override stop(_ctx: GoalContext<TSelf>): void {}
}
