import { Enemy } from "@server/entities/Enemy.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { Building } from "@server/entities/Building.ts";
import { Player } from "@server/entities/Player.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";

export class Saboteur extends Enemy {
  public static override readonly resourceName = "saboteur";

  public constructor(id: number) {
    super(id, {
      radius: 11,
      maxHp: 120,
      vx: 0,
      vy: 0,
      moveSpeed: 11,
      weapons: [new ZombieSword()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Building, 600),
        new TargetEntityGoal<Enemy>(1, Player, 600),
        new GoToTargetGoal<Enemy>(2, 22),
        new AttackAtGoal<Enemy>(3, 0),
      ],
    });
  }
}
