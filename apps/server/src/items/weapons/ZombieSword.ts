import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { MeleeWeapon } from "../MeleeWeapon.ts";

/**
 * Sword melee weapon used by zombies.
 */
export class ZombieSword extends MeleeWeapon {
  static readonly typeId = "item:zombie_sword" as const;

  constructor(id: number) {
    super(
      id,
      ZombieSword.typeId,
      5, // damage
      1, // fireRate (attacks per second)
      10, // range
      [new DamageEffect(5), new KnockbackEffect()], // hitEffects
      10, // meleeRange
    );
  }

  override clone(): ZombieSword {
    const cloned = new ZombieSword(this.id);
    cloned.ownerId = this.ownerId;
    cloned.data = { ...this.data };
    return cloned;
  }
}
