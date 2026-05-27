import { normalizeAngle } from "@shared/math/angle.ts";
import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import type { World } from "@server/world/World.ts";

const PELLET_COUNT = 10;
const SPREAD_ARC_RAD = Math.PI / 3;

export class Shotgun extends RangedWeapon {
  public static override readonly resourceName = "shotgun";

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
    const startAngle = baseAngle - SPREAD_ARC_RAD / 2;
    const step = SPREAD_ARC_RAD / (PELLET_COUNT - 1);
    for (let i = 0; i < PELLET_COUNT; i += 1) {
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
