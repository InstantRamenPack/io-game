import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";

export class Machete extends SweepMeleeWeapon {
  public static override readonly resourceName = "machete";

  constructor() {
    super([new BleedingEffect()]);
  }
}
