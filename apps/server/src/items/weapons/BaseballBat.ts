import { FracturedEffect } from "@server/effects/builtin/FracturedEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";

/**
 * Mid-range blunt melee weapon. Fractures targets on hit, slowing their movement.
 */
export class BaseballBat extends SweepMeleeWeapon {
  public static override readonly resourceName = "baseball_bat";

  constructor() {
    super([new FracturedEffect()]);
  }
}
