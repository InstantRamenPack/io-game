import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { createCombatTargetGoals } from "@server/goals/builtin/combatTargetGoals.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";

/**
 * Long-range military enemy that punishes open approaches.
 */
export class SniperEnemy extends Enemy {
  public static override readonly resourceName = "sniper";

  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(SniperEnemy.typeId, 0).weapons,
      goals: [
        ...createCombatTargetGoals(0, 1470),
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 620, 60, 90, 0.85, 600),
      ],
    });
  }
}
