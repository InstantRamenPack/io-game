import { Building } from "@server/entities/Building.ts";
import type { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { TargetNearestEntityGoal } from "@server/goals/builtin/TargetNearestEntityGoal.ts";

/**
 * Shared player/building targeting for wave and generic combat enemies.
 */
export function createCombatTargetGoal(
  priority: number,
  aggroRange: number,
): TargetNearestEntityGoal<Enemy> {
  return new TargetNearestEntityGoal<Enemy>(
    priority,
    [Player, Building],
    aggroRange,
    {
      requireLineOfSight: true,
    },
  );
}
