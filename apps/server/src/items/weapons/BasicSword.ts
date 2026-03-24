import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";

/**
 * Basic sword melee weapon.
 */
export class BasicSword extends SweepMeleeWeapon {
  public static override readonly resourceName = "basic_sword";

  public constructor() {
    super(
      2, // fireRate (attacks per second)
      60, // range
      [new DamageEffect(25), new KnockbackEffect()], // hitEffects
      60, // meleeRange
      110, // sweepArcDegrees
    );
  }
}
