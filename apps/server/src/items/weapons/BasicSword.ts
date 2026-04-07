import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import {
  createStandardMeleeHitEffects,
  requireSwingWeaponContent,
} from "@server/items/weaponContent.ts";

/**
 * Basic sword melee weapon.
 */
export class BasicSword extends SweepMeleeWeapon {
  public static override readonly resourceName = "basic_sword";

  constructor() {
    const weaponContent = requireSwingWeaponContent(BasicSword.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createStandardMeleeHitEffects(BasicSword.typeId),
      weaponContent.sweepArcDeg,
    );
  }
}
