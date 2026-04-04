import { RangedWeapon } from "@server/items/RangedWeapon.ts";

/**
 * Launcher that fires slow homing drones.
 */
export class DroneShooter extends RangedWeapon {
  public static override readonly resourceName = "drone_shooter";

  constructor() {
    super(0.8, "projectile:homing_drone", 3, 28, 0, "item:drone_mag");
  }
}
