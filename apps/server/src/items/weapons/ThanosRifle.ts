import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

export class ThanosRifle extends RangedWeapon {
  public static override readonly resourceName = "thanos_rifle";

  constructor() {
    const w = requireShootWeaponRuntime(ThanosRifle.typeId);
    super(w.cooldownTicks, w.projectileTypeId, w.magSize, w.reloadTicks, w.spreadDeg);
  }
}
