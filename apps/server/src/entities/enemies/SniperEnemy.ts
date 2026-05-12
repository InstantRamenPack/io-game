import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { Sniper } from "@server/items/weapons/Sniper.ts";

/**
 * Long-range military enemy that punishes open approaches.
 */
export class SniperEnemy extends Enemy {
  public static override readonly resourceName = "sniper";

  constructor(id: number) {
    super(id, {
      weapons: [new Sniper()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 980, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 620, 60, 90, 0.85),
      ],
    });
  }
}
