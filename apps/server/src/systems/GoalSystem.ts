import { Enemy } from "@server/entities/Enemy.ts";
import { GoalContext } from "@server/goals/GoalContext.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

/**
 * Ticks goal selectors for all server-authoritative enemies.
 */
export class GoalSystem implements System {
  /**
   * Builds goal contexts and runs each enemy's selector for the tick.
   * @param world Authoritative world being simulated.
   */
  update(world: World): void {
    for (const entity of world.entities.queryKind("enemy")) {
      if (!(entity instanceof Enemy)) {
        continue;
      }

      const goalContext = new GoalContext(world, entity);
      entity.goalSelector.tick(goalContext);
    }
  }
}
