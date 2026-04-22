import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireSwingWeaponRuntime,
} from "@server/combat/contentAdapters.ts";

/**
 * Sword melee weapon used by zombies.
 */
export class ZombieSword extends SweepMeleeWeapon {
  public static override readonly resourceName = "zombie_sword";

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(ZombieSword.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(ZombieSword.typeId),
      weaponContent.sweepArcDeg,
    );
  }
}
