import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

/**
 * Starter firearm that fires single-hit bullets.
 */
export class BasicGun extends RangedWeapon {
  static readonly typeId = "item:basic_gun" as const;

  constructor(id: number) {
    super(
      id,
      BasicGun.typeId,
      12,
      4,
      700,
      [new DamageEffect(12)],
      "projectile:basic_bullet",
      40,
      4,
      12,
      20,
      0,
    );
  }

  override clone(): BasicGun {
    const cloned = new BasicGun(this.id);
    cloned.ownerId = this.ownerId;
    cloned.data = { ...this.data };
    cloned.ammoInMag = this.ammoInMag;
    return cloned;
  }
}
