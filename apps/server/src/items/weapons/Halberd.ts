import { FracturedEffect } from "@server/effects/builtin/FracturedEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";

export class Halberd extends SweepMeleeWeapon {
  public static override readonly resourceName = "halberd";

  constructor() {
    super([new FracturedEffect()]);
  }
}
