import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireJabWeaponRuntime,
} from "@server/combat/contentAdapters.ts";

/**
 * Basic spear melee weapon.
 */
export class BasicSpear extends StabMeleeWeapon {
  public static override readonly resourceName = "basic_spear";

  constructor() {
    const weaponContent = requireJabWeaponRuntime(BasicSpear.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(BasicSpear.typeId),
      weaponContent.jabWidth,
    );
  }
}
