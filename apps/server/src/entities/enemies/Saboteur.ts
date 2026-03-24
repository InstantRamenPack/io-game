import { Enemy } from "@server/entities/Enemy.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { Building } from "@server/entities/Building.ts";
import { Player } from "@server/entities/Player.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { SaboteurSword } from "@server/items/weapons/SaboteurSword.ts";

export class Saboteur extends Enemy {
  public static override readonly resourceName = "saboteur";

  public constructor(id: number) {
    super(id, {
      radius: 11,
      maxHp: 120,
      vx: 0,
      vy: 0,
      moveSpeed: 11,
      weapons: [new SaboteurSword()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Building, Infinity),
        new TargetEntityGoal<Enemy>(1, Player, Infinity),
        new GoToTargetGoal<Enemy>(2, 22),
        new AttackAtGoal<Enemy>(3, 0),
      ],
    });
  }
}
