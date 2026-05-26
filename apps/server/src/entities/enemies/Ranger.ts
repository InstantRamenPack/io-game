import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
export class Ranger extends Enemy {
  public static override readonly resourceName = "ranger";

  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(Ranger.typeId, 0).weapons,
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 800, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 260, 40, 54, 0.55, 600),
      ],
    });
  }
}
