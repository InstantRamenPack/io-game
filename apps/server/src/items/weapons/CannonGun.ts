import type { Entity } from "@server/entities/Entity.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import type { World } from "@server/world/World.ts";

/**
 * Slow heavy turret weapon used by cannon buildings.
 */
export class CannonGun extends RangedWeapon {
  public static override readonly resourceName = "cannon_gun";

  constructor() {
    super(1, "projectile:cannon_bullet", 1, 36, 0);
  }

  protected override resolveProjectileOwnerId(
    world: World,
    owner: Entity,
  ): number | null {
    return owner.getCombatInstigator(world)?.id ?? null;
  }
}
