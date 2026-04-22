import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

export class BasicRifle extends RangedWeapon {
  public static override readonly resourceName = "basic_rifle";

  constructor() {
    const weaponContent = requireShootWeaponRuntime(BasicRifle.typeId);
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
