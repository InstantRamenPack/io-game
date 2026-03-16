import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { MeleeWeapon } from "./MeleeWeapon.ts";

/**
 * Basic sword melee weapon.
 */
export class BasicSword extends MeleeWeapon {
  constructor(id: number) {
    super(
      id,
      25, // damage
      2, // fireRate (attacks per second)
      60, // range
      [new DamageEffect(25)], // hitEffects
      60, // meleeRange
    );
  }

  override clone(): BasicSword {
    const cloned = new BasicSword(this.id);
    cloned.ownerId = this.ownerId;
    cloned.data = { ...this.data };
    return cloned;
  }
}
