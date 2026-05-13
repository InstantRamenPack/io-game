import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { RocketAttackGoal } from "@server/goals/builtin/RocketAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { ThanosFist } from "@server/items/weapons/ThanosFist.ts";
import { ThanosRifle } from "@server/items/weapons/ThanosRifle.ts";
import { ThanosRocketLauncher } from "@server/items/weapons/ThanosRocketLauncher.ts";

export class Thanos extends Enemy {
  public static override readonly resourceName = "thanos";

  constructor(id: number) {
    super(id, {
      weapons: [
        new ThanosFist(), // slot 0 — melee
        new ThanosRifle(), // slot 1 — rifle
        new ThanosRocketLauncher(), // slot 2 — rocket launcher
      ],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, Infinity, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        // Melee fist — highest attack priority, close range
        new AttackAtGoal<Enemy>(2, 0),
        // Rocket launcher — fires when player is behind a building
        new RocketAttackGoal<Enemy>(3, 2, 900),
        // Rifle — medium-range strafe attack
        new RangedAttackGoal<Enemy>(4, 1, 350, 60, 70, 0.45),
        // Chase movement when out of rifle range
        new GoToTargetGoal<Enemy>(5, 90),
      ],
    });
  }
}
