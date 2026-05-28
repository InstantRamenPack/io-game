import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { createCombatTargetGoal } from "@server/goals/builtin/combatTargetGoals.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";

/**
 * Police enemy that rushes into melee range and stuns with a taser sweep.
 */
export class Police extends Enemy {
  public static override readonly resourceName = "police";

  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(Police.typeId, 0).weapons,
      goals: [
        createCombatTargetGoal(0, 630),
        new LookAtTargetGoal<Enemy>(1),
        new GoToTargetGoal<Enemy>(2, 18),
        new AttackAtGoal<Enemy>(3, 0),
      ],
    });
  }
}
