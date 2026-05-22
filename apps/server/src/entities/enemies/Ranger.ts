import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import { Carbine } from "@server/items/weapons/Carbine.ts";
import { Crossbow } from "@server/items/weapons/Crossbow.ts";

type RangerWeaponCtor = new () => Weapon;

const RANGER_WEAPON_POOL: readonly RangerWeaponCtor[] = [Carbine, Crossbow];

export class Ranger extends Enemy {
  public static override readonly resourceName = "ranger";
  private static nextWeaponIndex = 0;

  constructor(id: number) {
    super(id, {
      weapons: [Ranger.createSpawnWeapon()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 800, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 260, 40, 54, 0.55, 600),
      ],
    });
  }

  private static createSpawnWeapon(): Weapon {
    const weaponCtor =
      RANGER_WEAPON_POOL[Ranger.nextWeaponIndex % RANGER_WEAPON_POOL.length] ??
      Carbine;
    Ranger.nextWeaponIndex += 1;
    return new weaponCtor();
  }
}
