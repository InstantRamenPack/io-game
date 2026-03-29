import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";

/**
 * Craftable pierce weapon with a small magazine and long reload.
 */
export class Crossbow extends RangedWeapon {
  public static override readonly resourceName = "crossbow";

  public constructor() {
    super(
      3,
      720,
      [new DamageEffect(16)],
      "projectile:basic_bullet",
      36,
      [makeHitboxRect(8, 8)],
      6,
      48,
      0,
      5,
    );
  }
}
