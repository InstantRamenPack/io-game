import { FracturedEffect } from "@server/effects/builtin/FracturedEffect.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireSwingWeaponRuntime,
} from "@server/combat/contentAdapters.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";

/**
 * Mid-range blunt melee weapon. Fractures targets on hit, slowing their movement.
 */
export class BaseballBat extends SweepMeleeWeapon {
  public static override readonly resourceName = "baseball_bat";

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(BaseballBat.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(BaseballBat.typeId, [
        new FracturedEffect(),
      ]),
      weaponContent.sweepArcDeg,
    );
  }
}
