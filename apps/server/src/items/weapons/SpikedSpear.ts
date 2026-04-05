import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";
import {
  createStandardMeleeHitEffects,
  requireJabWeaponContent,
} from "@server/items/weaponContent.ts";

/**
 * Spear variant that bleeds.
 */
export class SpikedSpear extends StabMeleeWeapon {
  public static override readonly resourceName = "spiked_spear";

  constructor() {
    const weaponContent = requireJabWeaponContent(SpikedSpear.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createStandardMeleeHitEffects(SpikedSpear.typeId, [new BleedingEffect()]),
      weaponContent.jabWidth,
    );
  }
}
