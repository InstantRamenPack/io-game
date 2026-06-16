import type { Entity } from "@server/entities/Entity.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import type { World } from "@server/world/World.ts";
import { getEntityCapabilities } from "@shared/content/catalog.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";

const CANNON_BUILDING_TYPE_ID = makeResourceId("building", "cannon");

/**
 * Slow heavy turret weapon used by cannon buildings.
 */
export class CannonGun extends RangedWeapon {
  public static override readonly resourceName = "cannon_gun";

  constructor() {
    const weaponContent = getEntityCapabilities(
      CANNON_BUILDING_TYPE_ID,
    )?.turretWeapon;
    if (!weaponContent) {
      throw new Error(
        `Missing turret weapon content for ${CANNON_BUILDING_TYPE_ID}.`,
      );
    }
    super(
      weaponContent.cooldownTicks,
      weaponContent.projectileTypeId,
      weaponContent.magSize,
      weaponContent.reloadTicks,
      weaponContent.spreadDeg,
      weaponContent.magItemTypeId,
    );
  }

  protected override resolveProjectileOwnerId(
    world: World,
    owner: Entity,
  ): number | null {
    return owner.getCombatInstigator(world)?.id ?? null;
  }
}
