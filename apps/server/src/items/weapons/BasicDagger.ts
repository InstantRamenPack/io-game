import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";
import {
  createStandardMeleeHitEffects,
  requireJabWeaponContent,
} from "@server/items/weaponContent.ts";

/**
 * Fast short-range stabbing weapon with low damage.
 */
export class BasicDagger extends StabMeleeWeapon {
  public static override readonly resourceName = "basic_dagger";

  constructor() {
    const weaponContent = requireJabWeaponContent(BasicDagger.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createStandardMeleeHitEffects(BasicDagger.typeId),
      weaponContent.jabWidth,
    );
  }
}
