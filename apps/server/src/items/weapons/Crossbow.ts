import { RangedWeapon } from "@server/items/RangedWeapon.ts";

/**
 * Craftable pierce weapon with a small magazine and long reload.
 */
export class Crossbow extends RangedWeapon {
  public static override readonly resourceName = "crossbow";

  public constructor() {
    super(3, "projectile:crossbow_arrow", 6, 48, 0);
  }
}
