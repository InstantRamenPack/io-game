import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";

/**
 * Basic spear melee weapon.
 */
export class BasicSpear extends StabMeleeWeapon {
  public static override readonly resourceName = "basic_spear";

  public constructor() {
    super(
      1.5, // fireRate (attacks per second)
      96, // range
      [new DamageEffect(25), new KnockbackEffect()], // hitEffects
      96, // meleeRange
      24, // stabWidth
    );
  }
}
