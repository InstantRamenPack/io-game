import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { createCombatTargetGoal } from "@server/goals/builtin/combatTargetGoals.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import { BaseballBat } from "@server/items/weapons/BaseballBat.ts";
import { BasicDagger } from "@server/items/weapons/BasicDagger.ts";
import { BasicSpear } from "@server/items/weapons/BasicSpear.ts";
import { Cleaver } from "@server/items/weapons/Cleaver.ts";
import { Scissors } from "@server/items/weapons/Scissors.ts";
import { BasicSword } from "@server/items/weapons/BasicSword.ts";

type DrifterWeaponCtor = new () => Weapon;

const DRIFTER_WEAPON_POOL: readonly DrifterWeaponCtor[] = [
  BasicSword,
  Scissors,
  BaseballBat,
  BasicDagger,
  Cleaver,
  BasicSpear,
];

export class Drifter extends Enemy {
  public static override readonly resourceName = "drifter";
  private static nextWeaponIndex = 0;

  /**
   * Creates a drifter with its default stats and chase goal stack.
   * @param id Stable runtime entity id.
   */
  constructor(id: number) {
    super(id, {
      weapons: [Drifter.createSpawnWeapon()],
      goals: [
        createCombatTargetGoal(0, 720),
        new LookAtTargetGoal<Enemy>(1),
        new GoToTargetGoal<Enemy>(2, 20),
        new AttackAtGoal<Enemy>(3, 0),
      ],
    });
  }

  private static createSpawnWeapon(): Weapon {
    // Rotate through the pool so each batch of drifters spawns with a mix
    // of weapons instead of clustering on a single roll.
    const weaponCtor =
      DRIFTER_WEAPON_POOL[
        Drifter.nextWeaponIndex % DRIFTER_WEAPON_POOL.length
      ] ?? BasicSword;
    Drifter.nextWeaponIndex += 1;
    return new weaponCtor();
  }
}
