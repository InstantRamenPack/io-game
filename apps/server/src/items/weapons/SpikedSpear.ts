import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";
import { KnockbackEffect } from "@server/effects";

/**
 * Spear variant that trades knockback for bleed.
 */
export class SpikedSpear extends StabMeleeWeapon {
  public static override readonly resourceName = "spiked_spear";

  constructor() {
    super(
      1.5,
      96,
      [new DamageEffect(25), new KnockbackEffect(), new BleedingEffect()],
      24,
    );
  }
}
