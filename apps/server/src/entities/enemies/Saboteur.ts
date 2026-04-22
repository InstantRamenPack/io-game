import { Enemy } from "@server/entities/Enemy.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { Building } from "@server/entities/Building.ts";
import { Player } from "@server/entities/Player.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { SaboteurSword } from "@server/items/weapons/SaboteurSword.ts";

export class Saboteur extends Enemy {
  public static override readonly resourceName = "saboteur";

  constructor(id: number) {
    super(id, {
      weapons: [new SaboteurSword()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Building, Infinity),
        new TargetEntityGoal<Enemy>(1, Player, Infinity),
        new LookAtTargetGoal<Enemy>(2),
        new GoToTargetGoal<Enemy>(3, 22),
        new AttackAtGoal<Enemy>(4, 0),
      ],
    });
  }
}
