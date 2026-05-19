import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

export class ShootaGun extends RangedWeapon {
  public static override readonly resourceName = "shoota_gun";

  constructor() {
    const weaponContent = requireShootWeaponRuntime(ShootaGun.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.projectileTypeId,
      weaponContent.magSize,
      weaponContent.reloadTicks,
      weaponContent.spreadDeg,
    );
  }
}
