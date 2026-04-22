import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

/**
 * Starter firearm that fires single-hit bullets.
 */
export class BasicGun extends RangedWeapon {
  public static override readonly resourceName = "basic_gun";

  constructor() {
    const weaponContent = requireShootWeaponRuntime(BasicGun.typeId);
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
