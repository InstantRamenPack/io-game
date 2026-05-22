import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import { FireAxe } from "@server/items/weapons/FireAxe.ts";
import { Katana } from "@server/items/weapons/Katana.ts";
import { SpikedSpear } from "@server/items/weapons/SpikedSpear.ts";

type StalkerWeaponCtor = new () => Weapon;

const STALKER_WEAPON_POOL: readonly StalkerWeaponCtor[] = [
  Katana,
  SpikedSpear,
  FireAxe,
];

/**
 * Fast forest flanker that closes through darkness and forces repositioning.
 */
export class Stalker extends Enemy {
  public static override readonly resourceName = "stalker";
  private static nextWeaponIndex = 0;

  constructor(id: number) {
    super(id, {
      weapons: [Stalker.createSpawnWeapon()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 840, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        new GoToTargetGoal<Enemy>(2, 16),
        new AttackAtGoal<Enemy>(3, 0),
      ],
    });
  }

  private static createSpawnWeapon(): Weapon {
    const weaponCtor =
      STALKER_WEAPON_POOL[
        Stalker.nextWeaponIndex % STALKER_WEAPON_POOL.length
      ] ?? Katana;
    Stalker.nextWeaponIndex += 1;
    return new weaponCtor();
  }
}
