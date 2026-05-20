import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

export class Lmg extends RangedWeapon {
  public static override readonly resourceName = "lmg";

  constructor() {
    const weaponContent = requireShootWeaponRuntime(Lmg.typeId);
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
