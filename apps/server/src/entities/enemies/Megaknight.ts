import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { JumpAttackGoal } from "@server/goals/builtin/JumpAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";

const BASE_RADIUS = 20;

export class Megaknight extends Enemy {
  public static override readonly resourceName = "megaknight";

  public constructor(id: number) {
    super(id, {
      radius: BASE_RADIUS,
      maxHp: 500,
      vx: 0,
      vy: 0,
      moveSpeed: 7,
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 600),
        // Jump when within 4000px; shrinks to radius 6, bursts to 40 on land, 40 aoe damage, 80px splash
        // Target is locked at windup start — kiting avoids the hit, camping gets punished.
        new JumpAttackGoal<Enemy>(1, BASE_RADIUS, 6, 40, 4000, 40, 120),
        // Chase normally when out of jump range or on cooldown
        new GoToTargetGoal<Enemy>(2, 30),
      ],
    });
  }
}
