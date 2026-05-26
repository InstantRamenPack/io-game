import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
/**
 * Durable rifle miniboss used for command-center and extraction guard encounters.
 */
export class Commander extends Enemy {
  public static override readonly resourceName = "commander";

  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(Commander.typeId, 0).weapons,
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 1080, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 360, 48, 36, 0.65, 600),
      ],
    });
  }
}
