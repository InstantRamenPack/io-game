import { FracturedEffect } from "@server/effects/builtin/FracturedEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import {
  createStandardMeleeHitEffects,
  requireSwingWeaponContent,
} from "@server/items/weaponContent.ts";

/**
 * Mid-range blunt melee weapon. Fractures targets on hit, slowing their movement.
 */
export class BaseballBat extends SweepMeleeWeapon {
  public static override readonly resourceName = "baseball_bat";

  constructor() {
    const weaponContent = requireSwingWeaponContent(BaseballBat.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createStandardMeleeHitEffects(BaseballBat.typeId, [new FracturedEffect()]),
      weaponContent.sweepArcDeg,
    );
  }
}
