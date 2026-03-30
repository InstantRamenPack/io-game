import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";

/**
 * Short-range stun weapon that disables targets in a melee arc.
 */
export class Taser extends SweepMeleeWeapon {
  public static override readonly resourceName = "taser";

  constructor() {
    super(
      1.25, // fireRate
      58, // range
      [new StunnedEffect()],
      58, // meleeRange
      95, // sweepArcDegrees
    );
  }
}
