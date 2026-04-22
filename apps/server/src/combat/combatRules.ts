import { combatEligibilityService } from "@server/combat/CombatEligibilityService.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";

/**
 * Returns whether the source can deal damage to the target in this combat pass.
 * @param world Authoritative world used to resolve combat instigators.
 * @param source Attacking entity.
 * @param target Potential target.
 * @returns True when the matchup is allowed.
 */
export function canAttackTarget(
  world: World,
  source: Entity,
  target: Entity,
): boolean {
  return combatEligibilityService.canAttackTarget(world, source, target);
}
