import { Enemy } from "@server/entities/Enemy.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { Building } from "@server/entities/Building.ts";
import { EnergyTower } from "@server/entities/buildings/EnergyTower.ts";
import { CommsTower } from "@server/entities/buildings/CommsTower.ts";
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
        new TargetEntityGoal<Enemy>(0, EnergyTower, Infinity),
        new TargetEntityGoal<Enemy>(1, CommsTower, Infinity),
        new TargetEntityGoal<Enemy>(2, Building, Infinity),
        new TargetEntityGoal<Enemy>(3, Player, Infinity),
        new LookAtTargetGoal<Enemy>(4),
        new GoToTargetGoal<Enemy>(5, 22),
        new AttackAtGoal<Enemy>(6, 0),
      ],
    });
  }
}
