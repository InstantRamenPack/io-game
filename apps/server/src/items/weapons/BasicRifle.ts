import { RangedWeapon } from "@server/items/RangedWeapon.ts";

export class BasicRifle extends RangedWeapon {
  public static override readonly resourceName = "basic_rifle";

  constructor() {
    super(2, "projectile:rifle_bullet", 30, 35, 0, "item:gun_mag");
  }
}
