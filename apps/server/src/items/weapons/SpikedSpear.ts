import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";

/**
 * Spear variant that bleeds.
 */
export class SpikedSpear extends StabMeleeWeapon {
  public static override readonly resourceName = "spiked_spear";

  constructor() {
    super([new BleedingEffect()]);
  }
}
