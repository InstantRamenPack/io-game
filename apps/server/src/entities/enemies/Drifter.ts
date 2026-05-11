import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import { BaseballBat } from "@server/items/weapons/BaseballBat.ts";
import { BasicDagger } from "@server/items/weapons/BasicDagger.ts";
import { BasicSpear } from "@server/items/weapons/BasicSpear.ts";
import { Cleaver } from "@server/items/weapons/Cleaver.ts";
import { requireHitboxEntityBaselineContent } from "@server/entities/entityBaselineContent.ts";
import { LeadPipe } from "@server/items/weapons/LeadPipe.ts";
import { Scissors } from "@server/items/weapons/Scissors.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";

type DrifterWeaponCtor = new () => Weapon;

const DRIFTER_WEAPON_POOL: readonly DrifterWeaponCtor[] = [
  ZombieSword,
  Scissors,
  LeadPipe,
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
    const combat = requireHitboxEntityBaselineContent(Drifter.typeId).combat;
    super(id, {
      weapons: [Drifter.createSpawnWeapon()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 480),
        new LookAtTargetGoal<Enemy>(1),
        new GoToTargetGoal<Enemy>(2, 20),
        new AttackAtGoal<Enemy>(3, 0, combat.attackMinIntervalTicks),
      ],
    });
  }

  private static createSpawnWeapon(): Weapon {
    // Rotate through the pool so each batch of drifters spawns with a mix
    // of weapons instead of clustering on a single roll.
    const weaponCtor =
      DRIFTER_WEAPON_POOL[
        Drifter.nextWeaponIndex % DRIFTER_WEAPON_POOL.length
      ] ?? ZombieSword;
    Drifter.nextWeaponIndex += 1;
    return new weaponCtor();
  }
}
