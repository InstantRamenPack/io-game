import { Weapon } from "./Weapon.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ItemKind } from "@shared/ids/ItemKinds.ts";

/**
 * Ranged weapon that fires projectiles.
 */
export class RangedWeapon extends Weapon {
  projectileClassId: string;
  ammoInMag: number;
  magSize: number;
  reloadMs: number;
  spread: number; // radians

  /** Reload timer in ms. */
  private reloadTimerMs: number = 0;

  constructor(
    id: number,
    damage: number,
    fireRate: number,
    range: number,
    hitEffects: string[],
    projectileClassId: string,
    magSize: number,
    reloadMs: number,
    spread: number = 0
  ) {
    super(id, "weapon" as ItemKind, damage, fireRate, range, hitEffects);
    this.projectileClassId = projectileClassId;
    this.magSize = magSize;
    this.reloadMs = reloadMs;
    this.spread = spread;
    this.ammoInMag = magSize; // start full
  }

  /** Advances cooldown and reload timers. */
  override tick(_world: World, dtMs: number): void {
    super.tick(_world, dtMs);
    if (this.reloadTimerMs > 0) {
      this.reloadTimerMs = Math.max(0, this.reloadTimerMs - dtMs);
      if (this.reloadTimerMs <= 0) {
        this.ammoInMag = this.magSize;
      }
    }
  }

  /** @returns True if weapon can fire now (has ammo, not reloading, cooldown ready). */
  override canFire(): boolean {
    return super.canFire() && this.ammoInMag > 0 && this.reloadTimerMs <= 0;
  }

  fire(world: World, owner: Entity, aimX: number, aimY: number): void {
    if (!this.canFire()) return;

    // Spawn projectile (placeholder; integrate with ProjectileSystem)
    // world.spawnProjectile(this.projectileClassId, owner, aimX, aimY, this.damage, this.hitEffects);

    this.ammoInMag--;
    this.resetCooldown();

    if (this.ammoInMag <= 0) {
      this.reloadTimerMs = this.reloadMs;
    }
  }
}