import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";

/**
 * Police enemy that rushes into melee range and stuns with a taser sweep.
 */
export class Police extends Enemy {
  public static override readonly resourceName = "police";

  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(Police.typeId, 0).weapons,
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 630, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        new GoToTargetGoal<Enemy>(2, 18),
        new AttackAtGoal<Enemy>(3, 0),
      ],
    });
  }
}
