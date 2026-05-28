import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { createCombatTargetGoal } from "@server/goals/builtin/combatTargetGoals.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
/**
 * Fast forest flanker that closes through darkness and forces repositioning.
 */
export class Stalker extends Enemy {
  public static override readonly resourceName = "stalker";

  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(Stalker.typeId, 0).weapons,
      goals: [
        createCombatTargetGoal(0, 840),
        new LookAtTargetGoal<Enemy>(1),
        new GoToTargetGoal<Enemy>(2, 16),
        new AttackAtGoal<Enemy>(3, 0),
      ],
    });
  }
}
