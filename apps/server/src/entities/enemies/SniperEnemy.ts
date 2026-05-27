import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import { HeavyPistol } from "@server/items/weapons/HeavyPistol.ts";
import { Lmg } from "@server/items/weapons/Lmg.ts";
import { FirecrackerGun } from "@server/items/weapons/FirecrackerGun.ts";
import { Sniper } from "@server/items/weapons/Sniper.ts";

type SniperWeaponCtor = new () => Weapon;

const SNIPER_WEAPON_POOL: readonly SniperWeaponCtor[] = [
  Sniper,
  HeavyPistol,
  Lmg,
  FirecrackerGun,
];

/**
 * Long-range military enemy that punishes open approaches.
 */
export class SniperEnemy extends Enemy {
  public static override readonly resourceName = "sniper";
  private static nextWeaponIndex = 0;

  constructor(id: number) {
    super(id, {
      weapons: [SniperEnemy.createSpawnWeapon()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 1470, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 620, 60, 90, 0.85, 600),
      ],
    });
  }

  private static createSpawnWeapon(): Weapon {
    const weaponCtor =
      SNIPER_WEAPON_POOL[
        SniperEnemy.nextWeaponIndex % SNIPER_WEAPON_POOL.length
      ] ?? Sniper;
    SniperEnemy.nextWeaponIndex += 1;
    return new weaponCtor();
  }
}
