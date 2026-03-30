import { getHitboxDirectionalExtent } from "@shared/geometry/hitbox.ts";
import { canAttackTarget } from "@server/combat/combatRules.ts";
import { Weapon } from "@server/items/Weapon.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  entityTypeRegistry,
  type RegistrableProjectileCtor,
} from "@server/registry/registries.ts";
import type { ProjectileSpawnConfig } from "@server/entities/Projectile.ts";
import type { WeaponSnapshot } from "@shared/net/snapshots.ts";

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

  /** Reload timer in fixed ticks. */
  protected reloadTicksRemaining = 0;

  constructor(
    fireRate: number,
    projectileTypeId: ResourceId,
    magSize: number,
    reloadTicks: number,
    spread: number = 0,
    magItemTypeId?: ResourceId,
  ) {
    super(fireRate);
    this.projectileTypeId = projectileTypeId;
    this.magSize = magSize;
    this.reloadTicks = reloadTicks;
    this.spread = spread;
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
      canAttackTarget(world, owner, target) &&
      this.isTargetInRange(
        owner,
        target,
        this.resolveProjectileType().definition.range,
      )
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

    const projectileOwnerId = this.resolveProjectileOwnerId(world, owner);
    if (projectileOwnerId === null) {
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
    world.spawn(new ProjectileCtor(world.allocEntityId(), projectileConfig));

    this.ammoInMag--;
    this.resetCooldown(world.gameConfig.tickRate);

    if (this.ammoInMag <= 0 && this.canReload(owner)) {
      this.reloadTicksRemaining = this.reloadTicks;
    }

    return true;
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
      reloadTicksRemaining: this.reloadTicksRemaining,
    };
  }

  public getProjectileSpeed(): number {
    return this.resolveProjectileType().definition.speed;
  }

  private resolveProjectileType(): RegistrableProjectileCtor {
    const projectileEntry = entityTypeRegistry.require(this.projectileTypeId);
    if (projectileEntry.kind !== "projectile") {
      throw new Error(
        `Expected projectile entity type for ${this.projectileTypeId}.`,
      );
    }
    return projectileEntry.ctor as RegistrableProjectileCtor;
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

  private canReload(owner: Entity | undefined): boolean {
    if (owner?.hasInfiniteReloadMags()) {
      return true;
    }

    if (!this.magItemTypeId) {
      return true;
    }

    return (owner?.getReloadInventory()?.getStackableCount(this.magItemTypeId) ?? 0) > 0;
  }

  private completeReload(owner: Entity | undefined): boolean {
    if (owner?.hasInfiniteReloadMags()) {
      return true;
    }

    if (!this.magItemTypeId) {
      return true;
    }

    return (
      owner?.getReloadInventory()?.consumeTypes([
      { typeId: this.magItemTypeId, amount: 1 },
      ]) ?? false
    );
  }
}
