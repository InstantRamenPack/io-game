import {
  createMeleeHitEffectsForWeapon,
  requireJabWeaponRuntime,
} from "@server/combat/contentAdapters.ts";
import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";

/**
 * Default fallback melee weapon used when the selected hotbar slot is empty.
 */
export class Fists extends StabMeleeWeapon {
  public static override readonly resourceName = "fists";

  constructor() {
    const weaponContent = requireJabWeaponRuntime(Fists.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(Fists.typeId),
      weaponContent.jabWidth,
    );
  }
}
