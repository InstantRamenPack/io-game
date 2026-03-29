import { RangedWeapon } from "@server/items/RangedWeapon.ts";

/**
 * Starter firearm that fires single-hit bullets.
 */
export class BasicGun extends RangedWeapon {
  public static override readonly resourceName = "basic_gun";

  constructor() {
    super(4, "projectile:basic_bullet", 12, 20, 0);
  }
}
