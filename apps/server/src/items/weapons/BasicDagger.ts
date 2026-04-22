import {
  createMeleeHitEffectsForWeapon,
  requireJabWeaponRuntime,
} from "@server/combat/contentAdapters.ts";
import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";

/**
 * Fast short-range stabbing weapon with low damage.
 */
export class BasicDagger extends StabMeleeWeapon {
  public static override readonly resourceName = "basic_dagger";

  constructor() {
    const weaponContent = requireJabWeaponRuntime(BasicDagger.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(BasicDagger.typeId),
      weaponContent.jabWidth,
    );
  }
}
