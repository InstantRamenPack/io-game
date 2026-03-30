import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { Taser } from "@server/items/weapons/Taser.ts";

/**
 * Police enemy that rushes into melee range and stuns with a taser sweep.
 */
export class Police extends Enemy {
  public static override readonly resourceName = "police";

  constructor(id: number) {
    super(id, {
      hitboxProfiles: {
        default: [makeHitboxRect(24, 24)],
      },
      maxHp: 110,
      vx: 0,
      vy: 0,
      moveSpeed: 9,
      weapons: [new Taser()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 420),
        new GoToTargetGoal<Enemy>(1, 18),
        new AttackAtGoal<Enemy>(2, 0),
      ],
    });
  }
}
