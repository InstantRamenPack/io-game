import { Weapon } from "./Weapon.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  projectileTypeRegistry,
  type RegistrableProjectileCtor,
} from "@server/registry/bootstrap.ts";
import type { ProjectileSpawnConfig } from "@server/entities/projectiles/Projectile.ts";

/**
 * Ranged weapon that fires projectiles.
 */
export class RangedWeapon extends Weapon {
  projectileTypeId: ResourceId;
  projectileSpeed: number;
  projectileRadius: number;
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
    projectileSpeed: number,
    projectileRadius: number,
    magSize: number,
    reloadTicks: number,
    spread: number = 0,
  ) {
    super(id, typeId, damage, fireRate, range, hitEffects);
    this.projectileTypeId = projectileTypeId;
    this.projectileSpeed = projectileSpeed;
    this.projectileRadius = projectileRadius;
    this.magSize = magSize;
    this.reloadTicks = reloadTicks;
    this.spread = spread;
    this.ammoInMag = magSize;
    this.syncRuntimeData();
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
    this.syncRuntimeData();
  }

  /** @returns True if weapon can fire now (has ammo, not reloading, cooldown ready). */
  override canFire(): boolean {
    return (
      super.canFire() && this.ammoInMag > 0 && this.reloadTicksRemaining <= 0
    );
  }

  override fire(world: World, owner: Entity, aimX: number, aimY: number): void {
    if (!this.canFire()) {
      return;
    }

    const deltaX = aimX - owner.x;
    const deltaY = aimY - owner.y;
    const aimDistance = Math.hypot(deltaX, deltaY);
    if (aimDistance <= 0) {
      return;
    }

    const baseAngle = Math.atan2(deltaY, deltaX);
    const spreadOffset =
      this.spread === 0
        ? 0
        : (world.randomNumberGenerator() - 0.5) * this.spread;
    const angle = baseAngle + spreadOffset;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const spawnDistance = owner.radius + this.projectileRadius + 2;
    const projectileConfig: ProjectileSpawnConfig = {
      ownerId: owner.id,
      x: owner.x + directionX * spawnDistance,
      y: owner.y + directionY * spawnDistance,
      directionX,
      directionY,
      speed: this.projectileSpeed,
      range: this.range,
      rotation: angle,
      radius: this.projectileRadius,
      damage: this.damage,
      hitEffects: this.hitEffects,
    };
    const ProjectileCtor: RegistrableProjectileCtor =
      projectileTypeRegistry.require(this.projectileTypeId);
    world.spawn(new ProjectileCtor(world.allocEntityId(), projectileConfig));

    this.ammoInMag--;
    this.resetCooldown(world.gameConfig.tickRate);

    if (this.ammoInMag <= 0) {
      this.reloadTicksRemaining = this.reloadTicks;
    }

    this.syncRuntimeData();
  }

  protected syncRuntimeData(): void {
    this.data = {
      ...this.data,
      ammoInMag: this.ammoInMag,
      magSize: this.magSize,
      reloadTicksRemaining: this.reloadTicksRemaining,
    };
  }
}
