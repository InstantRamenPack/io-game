import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { MeleeWeapon } from "@server/items/MeleeWeapon.ts";

/**
 * Basic sword melee weapon.
 */
export class BasicSword extends MeleeWeapon {
  public static readonly typeId = "item:basic_sword" as const;

  public constructor(id: number) {
    super(
      id,
      BasicSword.typeId,
      2, // fireRate (attacks per second)
      60, // range
      [new DamageEffect(25), new KnockbackEffect()], // hitEffects
      60, // meleeRange
    );
  }

  public override clone(): BasicSword {
    const cloned = new BasicSword(this.id);
    cloned.ownerId = this.ownerId;
    return cloned;
  }
}
