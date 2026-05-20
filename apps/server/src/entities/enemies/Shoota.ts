import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";

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
      weapons: [new BasicGun()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 720, {
          requireLineOfSight: true,
        }),
<<<<<<< HEAD
        new RangedAttackGoal<Enemy>(1, 0, 220, 32, 45, 1.0),
=======
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 220, 32, 45, 0.5, 600),
>>>>>>> fe1b8b69a18490d83a812559e5e5dae9d1180139
      ],
    });
  }
}
