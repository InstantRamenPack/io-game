import { Weapon } from "./Weapon.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Ranged weapon that fires projectiles.
 */
export class RangedWeapon extends Weapon {
  projectileTypeId: ResourceId;
  ammoInMag: number;
  magSize: number;
  reloadTicks: number;
  spread: number; // radians

  /** Reload timer in fixed ticks. */
  private reloadTicksRemaining = 0;

  constructor(
    id: number,
    typeId: ResourceId,
    damage: number,
    fireRate: number,
    range: number,
    hitEffects: Effect[],
    projectileTypeId: ResourceId,
    magSize: number,
    reloadTicks: number,
    spread: number = 0,
  ) {
    super(id, typeId, damage, fireRate, range, hitEffects);
    this.projectileTypeId = projectileTypeId;
    this.magSize = magSize;
    this.reloadTicks = reloadTicks;
    this.spread = spread;
    this.ammoInMag = magSize; // start full
  }

  /** Advances cooldown and reload timers by one fixed tick. */
  override tick(_world: World): void {
    super.tick(_world);
    if (this.reloadTicksRemaining > 0) {
      this.reloadTicksRemaining -= 1;
      if (this.reloadTicksRemaining <= 0) {
        this.ammoInMag = this.magSize;
      }
    }
  }

  /** @returns True if weapon can fire now (has ammo, not reloading, cooldown ready). */
  override canFire(): boolean {
    return (
      super.canFire() && this.ammoInMag > 0 && this.reloadTicksRemaining <= 0
    );
  }

  fire(world: World, owner: Entity, aimX: number, aimY: number): void {
    if (!this.canFire()) return;

    // Spawn projectile (placeholder; integrate with ProjectileSystem)
    // world.spawnProjectile(this.projectileTypeId, owner, aimX, aimY, this.damage, this.hitEffects);

    this.ammoInMag--;
    this.resetCooldown(world.gameConfig.tickRate);

    if (this.ammoInMag <= 0) {
      this.reloadTicksRemaining = this.reloadTicks;
    }
  }
}
