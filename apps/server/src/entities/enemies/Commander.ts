import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { BasicRifle } from "@server/items/weapons/BasicRifle.ts";

/**
 * Durable rifle miniboss used for command-center and extraction guard encounters.
 */
export class Commander extends Enemy {
  public static override readonly resourceName = "commander";

  constructor(id: number) {
    super(id, {
      weapons: [new BasicRifle()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 720),
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 360, 48, 36, 0.65),
      ],
    });
  }
}
