import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireSwingWeaponRuntime,
} from "@server/combat/contentAdapters.ts";

/**
 * Basic sword melee weapon.
 */
export class BasicSword extends SweepMeleeWeapon {
  public static override readonly resourceName = "basic_sword";

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(BasicSword.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(BasicSword.typeId),
      weaponContent.sweepArcDeg,
    );
  }
}
