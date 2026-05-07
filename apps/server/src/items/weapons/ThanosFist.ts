import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireSwingWeaponRuntime,
} from "@server/combat/contentAdapters.ts";

export class ThanosFist extends SweepMeleeWeapon {
  public static override readonly resourceName = "thanos_fist";

  constructor() {
    const w = requireSwingWeaponRuntime(ThanosFist.typeId);
    super(
      w.cooldownTicks,
      w.range,
      createMeleeHitEffectsForWeapon(ThanosFist.typeId),
      w.sweepArcDeg,
    );
  }
}
