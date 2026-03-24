import type { Entity } from "@server/entities/Entity.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import type { World } from "@server/world/World.ts";

/**
 * Slow heavy turret weapon used by cannon buildings.
 */
export class CannonGun extends RangedWeapon {
  public static override readonly resourceName = "cannon_gun";

  public constructor() {
    super(
      1,
      650,
      [new DamageEffect(30)],
      "projectile:cannon_bullet",
      24,
      6,
      1,
      36,
      0,
    );
  }

  protected override resolveProjectileOwnerId(
    world: World,
    owner: Entity,
  ): number | null {
    return owner.getCombatInstigator(world)?.id ?? null;
  }
}
