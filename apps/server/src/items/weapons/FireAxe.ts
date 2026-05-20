import { FracturedEffect } from "@server/effects/builtin/FracturedEffect.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireSwingWeaponRuntime,
} from "@server/combat/contentAdapters.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";

export class FireAxe extends SweepMeleeWeapon {
  public static override readonly resourceName = "fire_axe";

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(FireAxe.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(FireAxe.typeId, [new FracturedEffect()]),
      weaponContent.sweepArcDeg,
    );
  }
}
