import { requireShootWeaponContent } from "@server/items/weaponContent.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

/**
 * Craftable pierce weapon with a small magazine and long reload.
 */
export class Crossbow extends RangedWeapon {
  public static override readonly resourceName = "crossbow";

  constructor() {
    const weaponContent = requireShootWeaponContent(Crossbow.typeId);
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
