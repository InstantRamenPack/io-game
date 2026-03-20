import { Weapon } from "@server/items/Weapon.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  projectileTypeRegistry,
  type RegistrableProjectileCtor,
} from "@server/registry/registries.ts";
import type { ProjectileSpawnConfig } from "@server/entities/Projectile.ts";

/**
 * Ranged weapon that fires projectiles.
 */
export class RangedWeapon extends Weapon {
  public projectileTypeId: ResourceId;
  public projectileSpeed: number;
  public projectileRadius: number;
  public ammoInMag: number;
  public magSize: number;
  public reloadTicks: number;
  public spread: number;

  /** Reload timer in fixed ticks. */
  protected reloadTicksRemaining = 0;

  public constructor(
    id: number,
    typeId: ResourceId,
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
    super(id, typeId, fireRate, range, hitEffects);
    this.projectileTypeId = projectileTypeId;
    this.projectileSpeed = projectileSpeed;
    this.projectileRadius = projectileRadius;
    this.magSize = magSize;
    this.reloadTicks = reloadTicks;
    this.spread = spread;
    this.ammoInMag = magSize;
  }

  /** Advances cooldown and reload timers by one fixed tick. */
  public override tick(_world: World): void {
    super.tick(_world);
    if (this.reloadTicksRemaining > 0) {
      this.reloadTicksRemaining -= 1;
      if (this.reloadTicksRemaining <= 0) {
        this.ammoInMag = this.magSize;
      }
    }
  }

  /** @returns True if weapon can hit now (has ammo, not reloading, cooldown ready). */
  public override canHit(): boolean {
    return (
      super.canHit() && this.ammoInMag > 0 && this.reloadTicksRemaining <= 0
    );
  }

  public override canHitTarget(
    world: World,
    owner: Entity,
    target: Entity,
  ): boolean {
    return (
      this.canHit() &&
      world.combat.canAttackTarget(world, owner, target) &&
      this.isTargetInRange(owner, target)
    );
  }

  public override hit(
    world: World,
    owner: Entity,
    aimX: number,
    aimY: number,
  ): boolean {
    if (!this.canHit()) {
      return false;
    }

    const deltaX = aimX - owner.x;
    const deltaY = aimY - owner.y;
    const aimDistance = Math.hypot(deltaX, deltaY);
    if (aimDistance <= 0) {
      return false;
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

    return true;
  }

  public getAmmoSnapshot(): {
    ammoInMag: number;
    magSize: number;
    reloadTicksRemaining: number;
  } {
    return {
      ammoInMag: this.ammoInMag,
      magSize: this.magSize,
      reloadTicksRemaining: this.reloadTicksRemaining,
    };
  }

  protected copyRuntimeStateTo(target: RangedWeapon): void {
    target.ammoInMag = this.ammoInMag;
    target.reloadTicksRemaining = this.reloadTicksRemaining;
  }

  private isTargetInRange(owner: Entity, target: Entity): boolean {
    return Math.hypot(target.x - owner.x, target.y - owner.y) <= this.range;
  }
}
