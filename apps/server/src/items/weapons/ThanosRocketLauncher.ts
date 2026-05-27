import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

export class ThanosRocketLauncher extends RangedWeapon {
  public static override readonly resourceName = "thanos_rocket_launcher";

  constructor() {
    const w = requireShootWeaponRuntime(ThanosRocketLauncher.typeId);
    super(
      w.cooldownTicks,
      w.projectileTypeId,
      w.magSize,
      w.reloadTicks,
      w.spreadDeg,
      w.magItemTypeId,
    );
  }
}
