import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";

/**
 * Sword melee weapon used by zombies.
 */
export class ZombieSword extends SweepMeleeWeapon {
  public static override readonly resourceName = "zombie_sword";

  constructor() {
    super(
      1, // fireRate (attacks per second)
      10, // range
      [new DamageEffect(5), new KnockbackEffect()], // hitEffects
      110, // sweepArcDegrees
    );
  }
}
