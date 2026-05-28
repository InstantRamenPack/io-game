import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { normalizeAngle } from "@shared/math/angle.ts";

const BULLET_COUNT = 12;
const FAN_ARC_RAD = (120 * Math.PI) / 180;

/**
 * Fires BULLET_COUNT bullets simultaneously across a wide fan arc on each hit().
 * Used exclusively by Thanos via SprayAttackGoal — never in slot 0 or player inventory.
 */
export class ThanosMachineGun extends RangedWeapon {
  public static override readonly resourceName = "thanos_machine_gun";

  constructor() {
    const w = requireShootWeaponRuntime(ThanosMachineGun.typeId);
    super(
      w.cooldownTicks,
      w.projectileTypeId,
      w.magSize,
      w.reloadTicks,
      0, // spread — fan angles are computed explicitly in hit()
      w.magItemTypeId,
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

    const step = BULLET_COUNT > 1 ? FAN_ARC_RAD / (BULLET_COUNT - 1) : 0;
    const startAngle = baseAngle - FAN_ARC_RAD / 2;

    for (let i = 0; i < BULLET_COUNT; i++) {
      const angle = normalizeAngle(startAngle + step * i);
      this.fireProjectileAtAngle(world, owner, projectileOwnerId, angle);
    }

    this.ammoInMag -= BULLET_COUNT;
    if (this.ammoInMag < 0) {
      this.ammoInMag = 0;
    }
    this.resetCooldown();

    if (this.ammoInMag <= 0) {
      this.reloadTicksRemaining = this.reloadTicks;
    }

    return true;
  }
}
