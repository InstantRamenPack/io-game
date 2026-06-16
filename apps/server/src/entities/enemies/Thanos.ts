import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { createCombatTargetGoals } from "@server/goals/builtin/combatTargetGoals.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { RocketAttackGoal } from "@server/goals/builtin/RocketAttackGoal.ts";
import { SprayAttackGoal } from "@server/goals/builtin/SprayAttackGoal.ts";

export class Thanos extends Enemy {
  public static override readonly resourceName = "thanos";

  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(Thanos.typeId, 0).weapons,
      goals: [
        ...createCombatTargetGoals(0, 1470),
        new LookAtTargetGoal<Enemy>(1),
        // Melee fist — highest attack priority, close range
        new AttackAtGoal<Enemy>(2, 0),
        // Machine gun spray — fires 12 bullets in 120° fan every 10 seconds, any distance
        new SprayAttackGoal<Enemy>(2.5, 3, 200),
        // Rocket launcher — fires when player is behind a building
        new RocketAttackGoal<Enemy>(3, 2, 900),
        // Rifle — medium-range strafe attack
        new RangedAttackGoal<Enemy>(4, 1, 350, 60, 70, 0.45, 600),
        // Chase movement when out of rifle range
        new GoToTargetGoal<Enemy>(5, 90),
      ],
    });
  }
}
