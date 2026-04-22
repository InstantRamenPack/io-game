import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

/**
 * Launcher that fires slow homing drones.
 */
export class DroneShooter extends RangedWeapon {
  public static override readonly resourceName = "drone_shooter";

  constructor() {
    const weaponContent = requireShootWeaponRuntime(DroneShooter.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.projectileTypeId,
      weaponContent.magSize,
      weaponContent.reloadTicks,
      weaponContent.spreadDeg,
      weaponContent.magItemTypeId,
    );
  }
}
