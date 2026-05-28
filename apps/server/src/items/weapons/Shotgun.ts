import { normalizeAngle } from "@shared/math/angle.ts";
import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import type { World } from "@server/world/World.ts";

export class Shotgun extends RangedWeapon {
  public static override readonly resourceName = "shotgun";
  private readonly projectileCount: number;
  private readonly arcRad: number;

  constructor() {
    const weaponContent = requireShootWeaponRuntime(Shotgun.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.projectileTypeId,
      weaponContent.magSize,
      weaponContent.reloadTicks,
      weaponContent.spreadDeg,
      weaponContent.magItemTypeId,
    );
    if (weaponContent.special?.kind !== "shotgunFan") {
      throw new Error(`Missing shotgun fan tuning for ${Shotgun.typeId}.`);
    }
    this.projectileCount = weaponContent.special.projectileCount;
    this.arcRad = (weaponContent.special.arcDeg * Math.PI) / 180;
  }

  public override hit(world: World, owner: Entity, theta: number): boolean {
    if (!this.canHit()) {
      return false;
    }

    const projectileOwnerId = this.resolveProjectileOwnerId(world, owner);
    if (projectileOwnerId === null) {
      return false;
    }

    const baseAngle = normalizeAngle(theta);
    owner.rotation = baseAngle;
    const startAngle =
      this.projectileCount === 1 ? baseAngle : baseAngle - this.arcRad / 2;
    const step =
      this.projectileCount === 1 ? 0 : this.arcRad / (this.projectileCount - 1);
    for (let i = 0; i < this.projectileCount; i += 1) {
      this.fireProjectileAtAngle(
        world,
        owner,
        projectileOwnerId,
        startAngle + step * i,
      );
    }

    this.ammoInMag -= 1;
    this.resetCooldown();
    if (this.ammoInMag <= 0 && this.canReload(owner)) {
      this.reloadTicksRemaining = this.reloadTicks;
    }
    return true;
  }
}
