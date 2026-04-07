import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import {
  createStandardMeleeHitEffects,
  requireSwingWeaponContent,
} from "@server/items/weaponContent.ts";

/**
 * Sword melee weapon used by zombies.
 */
export class ZombieSword extends SweepMeleeWeapon {
  public static override readonly resourceName = "zombie_sword";

  constructor() {
    const weaponContent = requireSwingWeaponContent(ZombieSword.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createStandardMeleeHitEffects(ZombieSword.typeId),
      weaponContent.sweepArcDeg,
    );
  }
}
