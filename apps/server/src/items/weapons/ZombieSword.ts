import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { MeleeWeapon } from "@server/items/MeleeWeapon.ts";

/**
 * Sword melee weapon used by zombies.
 */
export class ZombieSword extends MeleeWeapon {
  public static override readonly resourceName = "zombie_sword";

  public constructor() {
    super(
      1, // fireRate (attacks per second)
      10, // range
      [new DamageEffect(5), new KnockbackEffect()], // hitEffects
      10, // meleeRange
    );
  }
}
