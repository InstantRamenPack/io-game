import { FracturedEffect } from "@server/effects/builtin/FracturedEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";

export class FireAxe extends SweepMeleeWeapon {
  public static override readonly resourceName = "fire_axe";

  constructor() {
    super([new FracturedEffect()]);
  }
}
