import { FracturedEffect } from "@server/effects/builtin/FracturedEffect.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireSwingWeaponRuntime,
} from "@server/combat/contentAdapters.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";

export class Halberd extends SweepMeleeWeapon {
  public static override readonly resourceName = "halberd";

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(Halberd.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(Halberd.typeId, [new FracturedEffect()]),
      weaponContent.sweepArcDeg,
    );
  }
}
