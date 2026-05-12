import { Building } from "@server/entities/Building.ts";
import { Crate } from "@server/entities/buildings/Crate.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

/**
 * Central authority for runtime combat targeting legality.
 */
export class CombatEligibilityService {
  public resolveInstigator(world: World, source: Entity): Entity | null {
    const instigator = source.getCombatInstigator(world);
    if (!instigator || !instigator.alive) {
      return null;
    }
    return instigator;
  }

  public canAttackTarget(
    world: World,
    source: Entity,
    target: Entity,
  ): boolean {
    const instigator = this.resolveInstigator(world, source);
    if (!instigator || !target.alive || instigator.id === target.id) {
      return false;
    }

    if (instigator instanceof Player) {
      return (
        target instanceof Enemy ||
        target instanceof Player ||
        target instanceof Crate
      );
    }
    if (instigator instanceof Enemy) {
      return target instanceof Player || target instanceof Building;
    }

    return false;
  }
}

export const combatEligibilityService = new CombatEligibilityService();
