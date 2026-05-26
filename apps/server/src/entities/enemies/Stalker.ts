import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
/**
 * Fast forest flanker that closes through darkness and forces repositioning.
 */
export class Stalker extends Enemy {
  public static override readonly resourceName = "stalker";

  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(Stalker.typeId, 0).weapons,
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 840, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        new GoToTargetGoal<Enemy>(2, 16),
        new AttackAtGoal<Enemy>(3, 0),
      ],
    });
  }
}
