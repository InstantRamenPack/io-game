import { Enemy } from "@server/entities/Enemy.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { TargetBuildingOrPlayerGoal } from "@server/goals/builtin/TargetBuildingOrPlayerGoal.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";

export class Saboteur extends Enemy {
  public static override readonly resourceName = "saboteur";

  public constructor(id: number) {
    super(id, {
      radius: 11,
      hp: 120,
      maxHp: 80,
      vx: 0,
      vy: 0,
      moveSpeed: 11,
      weapons: [new ZombieSword()],
      goals: [
        // Buildings first, players only when no buildings remain
        new TargetBuildingOrPlayerGoal<Enemy>(0, 560),
        new GoToTargetGoal<Enemy>(1, 22),
        new AttackAtGoal<Enemy>(2, 0),
      ],
    });
  }
}
