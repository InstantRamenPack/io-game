import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { createCombatTargetGoals } from "@server/goals/builtin/combatTargetGoals.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
export class Ranger extends Enemy {
  public static override readonly resourceName = "ranger";

  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(Ranger.typeId, 0).weapons,
      goals: [
        ...createCombatTargetGoals(0, 800),
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 260, 40, 54, 0.55, 600),
      ],
    });
  }
}
