import { Enemy } from "@server/entities/Enemy.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { Building } from "@server/entities/Building.ts";
import { Player } from "@server/entities/Player.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { SaboteurSword } from "@server/items/weapons/SaboteurSword.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";

export class Saboteur extends Enemy {
  public static override readonly resourceName = "saboteur";

  constructor(id: number) {
    super(id, {
      hitboxProfiles: {
        default: [makeHitboxRect(18, 12, 0, -6), makeHitboxRect(22, 14, 0, 8)],
      },
      maxHp: 80,
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
