import { Enemy } from "@server/entities/Enemy.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { JumpAttackGoal } from "@server/goals/builtin/JumpAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";

const BASE_RADIUS = 20;

export class Megaknight extends Enemy {
  public static override readonly resourceName = "megaknight";

  public constructor(id: number) {
    super(id, {
      radius: BASE_RADIUS,
      hp: 500,
      maxHp: 500,
      vx: 0,
      vy: 0,
      moveSpeed: 5,
      goals: [
        new TargetEntityGoal<Enemy>(0, 600),
        // Jump when within 280px; shrinks to radius 6, bursts to 40 on land, 30 aoe damage, 100px splash
        // Target is locked at windup start — kiting avoids the hit, camping gets punished.
        new JumpAttackGoal<Enemy>(1, BASE_RADIUS, 6, 40, 280, 30, 100),
        // Chase normally when out of jump range or on cooldown
        new GoToTargetGoal<Enemy>(2, 24),
      ],
    });
  }
}
