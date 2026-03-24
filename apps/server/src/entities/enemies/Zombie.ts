import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";

export class Zombie extends Enemy {
  public static override readonly resourceName = "zombie";

  /**
   * Creates a zombie with its default stats and chase goal stack.
   * @param id Stable runtime entity id.
   */
  public constructor(id: number) {
    super(id, {
      radius: 12,
      hp: 100,
      maxHp: 100,
      vx: 0,
      vy: 0,
      moveSpeed: 8,
      weapons: [new ZombieSword()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 480),
        new GoToTargetGoal<Enemy>(1, 20),
        new AttackAtGoal<Enemy>(2, 0),
      ],
    });
  }
}
