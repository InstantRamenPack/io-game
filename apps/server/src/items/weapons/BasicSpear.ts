import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";
import {
  createStandardMeleeHitEffects,
  requireJabWeaponContent,
} from "@server/items/weaponContent.ts";

/**
 * Basic spear melee weapon.
 */
export class BasicSpear extends StabMeleeWeapon {
  public static override readonly resourceName = "basic_spear";

  constructor() {
    const weaponContent = requireJabWeaponContent(BasicSpear.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createStandardMeleeHitEffects(BasicSpear.typeId),
      weaponContent.jabWidth,
    );
  }
}
