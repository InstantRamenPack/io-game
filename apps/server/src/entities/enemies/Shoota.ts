import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";

/**
 * Default ranged enemy that keeps distance and fires basic bullets.
 */
export class Shoota extends Enemy {
  public static override readonly resourceName = "shoota";

  /**
   * Creates a shoota with its default stats and a ranged strafing goal stack.
   * @param id Stable runtime entity id.
   */
  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(Shoota.typeId, 0).weapons,
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 720, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 220, 32, 45, 0.5, 600),
      ],
    });
  }
}
