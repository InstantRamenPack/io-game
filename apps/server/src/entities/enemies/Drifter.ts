import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { createCombatTargetGoals } from "@server/goals/builtin/combatTargetGoals.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";

export class Drifter extends Enemy {
  public static override readonly resourceName = "drifter";

  /**
   * Creates a drifter with its default stats and chase goal stack.
   * @param id Stable runtime entity id.
   */
  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(Drifter.typeId, 0).weapons,
      goals: [
        ...createCombatTargetGoals(0, 720),
        new LookAtTargetGoal<Enemy>(1),
        new GoToTargetGoal<Enemy>(2, 20),
        new AttackAtGoal<Enemy>(3, 0),
      ],
    });
  }
}
