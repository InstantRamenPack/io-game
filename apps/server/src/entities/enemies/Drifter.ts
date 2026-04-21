import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";

export class Drifter extends Enemy {
  public static override readonly resourceName = "drifter";

  /**
   * Creates a drifter with its default stats and chase goal stack.
   * @param id Stable runtime entity id.
   */
  constructor(id: number) {
    super(id, {
      hitboxProfiles: {
        default: [makeHitboxRect(24, 24)],
      },
      maxHp: 100,
      moveSpeed: 8,
      weapons: [new ZombieSword()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 480),
        new LookAtTargetGoal<Enemy>(1),
        new GoToTargetGoal<Enemy>(2, 20),
        new AttackAtGoal<Enemy>(3, 0),
      ],
    });
  }
}
