import { getHitboxDirectionalExtent } from "@shared/geometry/hitbox.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { Weapon } from "@server/items/Weapon.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  entityTypeRegistry,
  type RegistrableProjectileCtor,
} from "@server/registry/registries.ts";
import type { ProjectileSpawnConfig } from "@server/entities/Projectile.ts";
import type {
  EquippedItemSnapshot,
  WeaponSnapshot,
} from "@shared/net/snapshots.ts";
import { isProjectileCtor } from "@server/runtime/ctorGuards.ts";

/**
 * Ranged weapon that fires projectiles.
 */
export class RangedWeapon extends Weapon {
  public projectileTypeId: ResourceId;
  public ammoInMag: number;
  public magSize: number;
  public reloadTicks: number;
  public spread: number;
  public magItemTypeId?: ResourceId;
  private rangeMultiplier = 1;

  /** Reload timer in fixed ticks. */
  protected reloadTicksRemaining = 0;

  constructor(
    cooldownTicks: number,
    projectileTypeId: ResourceId,
    magSize: number,
    reloadTicks: number,
    spread: number = 0,
    magItemTypeId?: ResourceId,
  ) {
    super(cooldownTicks);
    this.projectileTypeId = projectileTypeId;
    this.magSize = magSize;
    this.reloadTicks = reloadTicks;
    this.spread = (spread * Math.PI) / 180;
    this.magItemTypeId = magItemTypeId;
    this.ammoInMag = magSize;
  }

  /** Advances cooldown and reload timers by one fixed tick. */
  public override tick(world: World): void {
    super.tick(world);
    const owner = this.resolveOwner(world);
    if (
      this.ammoInMag <= 0 &&
      this.reloadTicksRemaining <= 0 &&
      this.canReload(owner)
    ) {
      this.reloadTicksRemaining = this.reloadTicks;
    }

    if (this.reloadTicksRemaining > 0) {
      this.reloadTicksRemaining -= 1;
      if (this.reloadTicksRemaining <= 0) {
        if (!this.completeReload(owner)) {
          this.reloadTicksRemaining = 0;
          this.ammoInMag = 0;
          return;
        }
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
      DamageEffect.canApply(world, owner, target) &&
      this.isTargetInRange(owner, target, this.getProjectileRange())
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
    const spreadOffset =
      this.spread === 0
        ? 0
        : (world.randomNumberGenerator() - 0.5) * this.spread;
    const angle = baseAngle + spreadOffset;
    this.fireProjectileAtAngle(world, owner, projectileOwnerId, angle);

    this.ammoInMag--;
    this.resetCooldown();

    if (this.ammoInMag <= 0 && this.canReload(owner)) {
      this.reloadTicksRemaining = this.reloadTicks;
    }

    return true;
  }

  protected fireProjectileAtAngle(
    world: World,
    owner: Entity,
    projectileOwnerId: number,
    angle: number,
  ): void {
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const ProjectileCtor = this.resolveProjectileType();
    const projectileDefinition = ProjectileCtor.definition;
    const spawnDistance =
      owner.getHitboxDirectionalExtent(directionX, directionY) +
      getHitboxDirectionalExtent(
        projectileDefinition.hitboxes,
        directionX,
        directionY,
      ) +
      2;
    const projectileConfig: ProjectileSpawnConfig = {
      ownerId: projectileOwnerId,
      x: owner.x + directionX * spawnDistance,
      y: owner.y + directionY * spawnDistance,
      directionX,
      directionY,
      rotation: angle,
    };
    const projectile = new ProjectileCtor(
      world.allocEntityId(),
      projectileConfig,
    );
    projectile.remainingRange *= this.rangeMultiplier;
    world.spawn(projectile);
  }

  protected resolveProjectileOwnerId(
    _world: World,
    owner: Entity,
  ): number | null {
    return owner.id;
  }

  public override toSnapshot(): WeaponSnapshot {
    return {
      ...super.toSnapshot(),
      ammoInMag: this.ammoInMag,
      magSize: this.magSize,
      reloadTicks: this.reloadTicks,
      reloadTicksRemaining: this.reloadTicksRemaining,
    };
  }

  public override getReserveMagCount(
    owner: Entity | undefined,
  ): number | undefined {
    if (owner?.hasInfiniteReloadMags()) {
      return undefined;
    }

    if (!this.magItemTypeId) {
      return undefined;
    }

    return (
      owner?.getReloadInventory()?.getStackableCount(this.magItemTypeId) ?? 0
    );
  }

  public getProjectileSpeed(): number {
    return this.resolveProjectileType().definition.speed;
  }

  public getProjectileRange(): number {
    return this.resolveProjectileType().definition.range * this.rangeMultiplier;
  }

  public override scaleAttackRange(multiplier: number): void {
    this.rangeMultiplier *= multiplier;
  }

  public override toEquippedItemSnapshot(
    owner: Entity | undefined,
  ): EquippedItemSnapshot {
    return {
      ...super.toEquippedItemSnapshot(owner),
      ammoInMag: this.ammoInMag,
      magSize: this.magSize,
      reserveMagCount: this.getReserveMagCount(owner),
      reloadTicks: this.reloadTicks,
      reloadTicksRemaining: this.reloadTicksRemaining,
    };
  }

  protected resolveProjectileType(): RegistrableProjectileCtor {
    const projectileEntry = entityTypeRegistry.require(this.projectileTypeId);
    if (projectileEntry.kind !== "projectile") {
      throw new Error(
        `Expected projectile entity type for ${this.projectileTypeId}.`,
      );
    }
    if (!isProjectileCtor(projectileEntry.ctor)) {
      throw new Error(
        `Expected projectile entity constructor for ${this.projectileTypeId}.`,
      );
    }
    return projectileEntry.ctor;
  }

  private isTargetInRange(
    owner: Entity,
    target: Entity,
    range: number,
  ): boolean {
    return Math.hypot(target.x - owner.x, target.y - owner.y) <= range;
  }

  private resolveOwner(world: World): Entity | undefined {
    return this.ownerId !== undefined ? world.get(this.ownerId) : undefined;
  }

  protected canReload(owner: Entity | undefined): boolean {
    if (owner?.hasInfiniteReloadMags()) {
      return true;
    }

    if (!this.magItemTypeId) {
      return true;
    }

    return (
      (owner?.getReloadInventory()?.getStackableCount(this.magItemTypeId) ??
        0) > 0
    );
  }

  private completeReload(owner: Entity | undefined): boolean {
    if (owner?.hasInfiniteReloadMags()) {
      return true;
    }

    if (!this.magItemTypeId) {
      return true;
    }

    return (
      owner
        ?.getReloadInventory()
        ?.consumeTypes([{ typeId: this.magItemTypeId, amount: 1 }]) ?? false
    );
  }
}
