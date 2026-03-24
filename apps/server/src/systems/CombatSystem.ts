import { Enemy } from "@server/entities/Enemy.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import { Building } from "@server/entities/Building.ts";
import type { World } from "@server/world/World.ts";

/**
 * Owns combat targeting rules.
 */
export class CombatSystem {
  /**
   * Returns whether the source can deal damage to the target in this combat pass.
   * @param world
   * @param source Attacking entity.
   * @param target Potential target.
   * @returns True when the matchup is allowed.
   */
  canAttackTarget(world: World, source: Entity, target: Entity): boolean {
    const instigator = source.getCombatInstigator(world);
    if (!instigator || !instigator.alive || !target.alive) {
      return false;
    }
    if (instigator.id === target.id) {
      return false;
    }

    if (instigator instanceof Player) {
      return target instanceof Enemy || target instanceof Player;
    }
    if (instigator instanceof Enemy) {
      return target instanceof Player || target instanceof Building;
    }
    return false;
  }
}
