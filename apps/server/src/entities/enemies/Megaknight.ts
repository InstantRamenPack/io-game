import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { JumpAttackGoal } from "@server/goals/builtin/JumpAttackGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";

const BASE_SIZE = 40;
const MIN_SIZE = 12;
const LAND_SIZE = 80;

export class Megaknight extends Enemy {
  public static override readonly resourceName = "megaknight";

  constructor(id: number) {
    super(id, {
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 900, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        new JumpAttackGoal<Enemy>(
          2,
          "base",
          BASE_SIZE,
          MIN_SIZE,
          LAND_SIZE,
          4000,
        ),
        new GoToTargetGoal<Enemy>(3, 30),
      ],
    });
  }
}
