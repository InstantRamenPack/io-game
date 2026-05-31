import { Building } from "@server/entities/Building.ts";
import type { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";

/**
 * Shared player-first, building-fallback targeting for generic combat enemies.
 */
export function createCombatTargetGoals(
  priority: number,
  aggroRange: number,
): readonly TargetEntityGoal<Enemy>[] {
  return [
    new TargetEntityGoal<Enemy>(priority, Player, aggroRange, {
      requireLineOfSight: true,
    }),
    new TargetEntityGoal<Enemy>(priority + 0.5, Building, aggroRange, {
      requireLineOfSight: true,
    }),
  ];
}
