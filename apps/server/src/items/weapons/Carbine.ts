import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

export class Carbine extends RangedWeapon {
  public static override readonly resourceName = "carbine";

  constructor() {
    const weaponContent = requireShootWeaponRuntime(Carbine.typeId);
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
