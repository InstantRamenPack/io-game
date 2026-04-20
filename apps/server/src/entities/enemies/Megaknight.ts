import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { JumpAttackGoal } from "@server/goals/builtin/JumpAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";

const BASE_SIZE = 40;
const MIN_SIZE = 12;
const LAND_SIZE = 80;

export class Megaknight extends Enemy {
  public static override readonly resourceName = "megaknight";

  constructor(id: number) {
    super(id, {
      hitboxProfiles: {
        base: [makeHitboxRect(28, 20, 0, -10), makeHitboxRect(40, 20, 0, 10)],
      },
      activeHitboxProfile: "base",
      maxHp: 150,
      moveSpeed: 7,
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 600),
        new JumpAttackGoal<Enemy>(
          1,
          "base",
          BASE_SIZE,
          MIN_SIZE,
          LAND_SIZE,
          4000,
        ),
        new GoToTargetGoal<Enemy>(2, 30),
      ],
    });
  }
}
