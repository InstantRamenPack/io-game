import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import {
  createStandardMeleeHitEffects,
  requireSwingWeaponContent,
} from "@server/items/weaponContent.ts";

/**
 * Short-range stun weapon that disables targets in a melee arc.
 */
export class Taser extends SweepMeleeWeapon {
  public static override readonly resourceName = "taser";

  constructor() {
    const weaponContent = requireSwingWeaponContent(Taser.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createStandardMeleeHitEffects(Taser.typeId, [new StunnedEffect()]),
      weaponContent.sweepArcDeg,
    );
  }
}
