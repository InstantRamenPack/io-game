import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";

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
      hitboxProfiles: {
        default: [makeHitboxRect(24, 24)],
      },
      maxHp: 100,
      moveSpeed: 8,
      weapons: [new BasicGun()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 480),
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 220, 32, 45),
      ],
    });
  }
}
