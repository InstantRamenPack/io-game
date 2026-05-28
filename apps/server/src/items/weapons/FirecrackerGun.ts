import { normalizeAngle } from "@shared/math/angle.ts";
import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import type { World } from "@server/world/World.ts";

export class FirecrackerGun extends RangedWeapon {
  public static override readonly resourceName = "firecracker_gun";
  private readonly selfKnockback: number;

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
    if (weaponContent.special?.kind !== "firecrackerLauncher") {
      throw new Error(
        `Missing firecracker launcher tuning for ${FirecrackerGun.typeId}.`,
      );
    }
    this.selfKnockback = weaponContent.special.selfKnockback;
  }

  public override hit(world: World, owner: Entity, theta: number): boolean {
    if (!super.hit(world, owner, theta)) {
      return false;
    }

    const angle = normalizeAngle(theta);
    owner.applyImpulse(
      -Math.cos(angle) * this.selfKnockback,
      -Math.sin(angle) * this.selfKnockback,
    );
    return true;
  }
}
