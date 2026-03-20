import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";

/**
 * Default melee chaser enemy used for the initial hostile population.
 */
export class Zombie extends Enemy {
  public static readonly typeId = "enemy:zombie" as const;

  /**
   * Creates a zombie with its default stats and chase goal stack.
   * @param id Stable runtime entity id.
   */
  public constructor(id: number) {
    const arrivalRadius = 20;

    super(id, Zombie.typeId, {
      radius: 12,
      hp: 100,
      maxHp: 100,
      vx: 0,
      vy: 0,
      moveSpeed: 8,
      aggroRange: 480,
      arrivalRadius,
      goals: [
        new TargetEntityGoal<Enemy>(0),
        new GoToTargetGoal<Enemy>(1, arrivalRadius),
        new AttackAtGoal<Enemy>(2, 0),
      ],
    });
  }
}
