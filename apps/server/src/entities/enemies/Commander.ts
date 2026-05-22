import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import { BasicRifle } from "@server/items/weapons/BasicRifle.ts";
import { DroneShooter } from "@server/items/weapons/DroneShooter.ts";
import { MachinePistol } from "@server/items/weapons/MachinePistol.ts";

type CommanderWeaponCtor = new () => Weapon;

const COMMANDER_WEAPON_POOL: readonly CommanderWeaponCtor[] = [
  BasicRifle,
  MachinePistol,
  DroneShooter,
];

/**
 * Durable rifle miniboss used for command-center and extraction guard encounters.
 */
export class Commander extends Enemy {
  public static override readonly resourceName = "commander";
  private static nextWeaponIndex = 0;

  constructor(id: number) {
    super(id, {
      weapons: [Commander.createSpawnWeapon()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 1080, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(1),
        new RangedAttackGoal<Enemy>(2, 0, 360, 48, 36, 0.65, 600),
      ],
    });
  }

  private static createSpawnWeapon(): Weapon {
    const weaponCtor =
      COMMANDER_WEAPON_POOL[
        Commander.nextWeaponIndex % COMMANDER_WEAPON_POOL.length
      ] ?? BasicRifle;
    Commander.nextWeaponIndex += 1;
    return new weaponCtor();
  }
}
