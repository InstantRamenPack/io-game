import { createEnemySpawnWeapons, Enemy } from "@server/entities/Enemy.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { Building } from "@server/entities/Building.ts";
import { EnergyTower } from "@server/entities/buildings/EnergyTower.ts";
import { CommsTower } from "@server/entities/buildings/CommsTower.ts";
import { Recycler } from "@server/entities/buildings/Recycler.ts";
import { Player } from "@server/entities/Player.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";

export class Saboteur extends Enemy {
  public static override readonly resourceName = "saboteur";

  constructor(id: number) {
    super(id, {
      weapons: createEnemySpawnWeapons(Saboteur.typeId, 0).weapons,
      goals: [
        new TargetEntityGoal<Enemy>(0, EnergyTower, 1200),
        new TargetEntityGoal<Enemy>(1, CommsTower, 1200),
        new TargetEntityGoal<Enemy>(
          2,
          Building,
          900,
          (e) => !(e instanceof Recycler),
        ),
        new TargetEntityGoal<Enemy>(3, Player, 600, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(4),
        new GoToTargetGoal<Enemy>(5, 22),
        new AttackAtGoal<Enemy>(6, 0),
      ],
    });
  }
}
