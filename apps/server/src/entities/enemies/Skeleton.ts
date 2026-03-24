import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";

/**
 * Default ranged enemy that keeps distance and fires basic bullets.
 */
export class Skeleton extends Enemy {
  public static override readonly resourceName = "skeleton";

  /**
   * Creates a skeleton with zombie-like stats and a ranged strafing goal stack.
   * @param id Stable runtime entity id.
   */
  public constructor(id: number) {
    super(id, {
      radius: 12,
      maxHp: 100,
      vx: 0,
      vy: 0,
      moveSpeed: 8,
      weapons: [new BasicGun()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 480),
        new RangedAttackGoal<Enemy>(1, 0, 220, 32, 45),
      ],
    });
  }
}
