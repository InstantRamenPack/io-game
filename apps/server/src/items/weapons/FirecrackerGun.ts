import { normalizeAngle } from "@shared/math/angle.ts";
import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import type { World } from "@server/world/World.ts";

const SELF_KNOCKBACK = 24;

export class FirecrackerGun extends RangedWeapon {
  public static override readonly resourceName = "firecracker_gun";

  constructor() {
    const weaponContent = requireShootWeaponRuntime(FirecrackerGun.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.projectileTypeId,
      weaponContent.magSize,
      weaponContent.reloadTicks,
      weaponContent.spreadDeg,
      weaponContent.magItemTypeId,
    );
  }

  public override hit(world: World, owner: Entity, theta: number): boolean {
    if (!super.hit(world, owner, theta)) {
      return false;
    }

    const angle = normalizeAngle(theta);
    owner.applyImpulse(
      -Math.cos(angle) * SELF_KNOCKBACK,
      -Math.sin(angle) * SELF_KNOCKBACK,
    );
    return true;
  }
}
