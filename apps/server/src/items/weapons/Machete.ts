import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireSwingWeaponRuntime,
} from "@server/combat/contentAdapters.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";

export class Machete extends SweepMeleeWeapon {
  public static override readonly resourceName = "machete";

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(Machete.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(Machete.typeId, [new BleedingEffect()]),
      weaponContent.sweepArcDeg,
    );
  }
}
