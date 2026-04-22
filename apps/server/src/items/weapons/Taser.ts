import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireSwingWeaponRuntime,
} from "@server/combat/contentAdapters.ts";

/**
 * Short-range stun weapon that disables targets in a melee arc.
 */
export class Taser extends SweepMeleeWeapon {
  public static override readonly resourceName = "taser";

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(Taser.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(Taser.typeId, [new StunnedEffect()]),
      weaponContent.sweepArcDeg,
    );
  }
}
