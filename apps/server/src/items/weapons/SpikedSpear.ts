import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireJabWeaponRuntime,
} from "@server/combat/contentAdapters.ts";

/**
 * Spear variant that bleeds.
 */
export class SpikedSpear extends StabMeleeWeapon {
  public static override readonly resourceName = "spiked_spear";

  constructor() {
    const weaponContent = requireJabWeaponRuntime(SpikedSpear.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(SpikedSpear.typeId, [
        new BleedingEffect(),
      ]),
      weaponContent.jabWidth,
    );
  }
}
