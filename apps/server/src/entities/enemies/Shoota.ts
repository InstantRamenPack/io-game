import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { ShootaGun } from "@server/items/weapons/ShootaGun.ts";

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
      weapons: [new ShootaGun()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 720, {
          requireLineOfSight: true,
        }),
        new RangedAttackGoal<Enemy>(1, 0, 220, 32, 45, 1.0),
      ],
    });
  }
}
