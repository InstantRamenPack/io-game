import { cloneHitboxRects, type HitboxRect } from "@shared/geometry/hitbox.ts";
import type { Entity as CombatEntity } from "@server/entities/Entity.ts";
import { projectileImpactResolver } from "@server/combat/ProjectileImpactResolver.ts";
import { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import { requireEntityBaselineContent } from "@server/entities/entityBaselineContent.ts";
import type { World } from "@server/world/World.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { ProjectileSnapshot } from "@shared/net/snapshots.ts";

export type ProjectileDefinition = {
  speed: number;
  range: number;
  hitboxes: readonly HitboxRect[];
  maxHits?: number | null;
  hitEffects?: readonly Effect[];
};

export type ProjectileSpawnConfig = {
  ownerId: number;
  x: number;
  y: number;
  directionX: number;
  directionY: number;
  rotation?: number;
};

type ProjectileCtorWithDefinition = typeof Projectile & {
  readonly definition: ProjectileDefinition;
};

export type ProjectileImpactTarget = {
  target: CombatEntity;
  hitTime: number;
  distanceSquaredFromPrevious: number;
  tieBreakerDistanceSquared: number;
};

/**
 * Shared base for server-authoritative projectiles.
 * Projectiles own their post-move lifetime and hit resolution after movement.
 */
export abstract class Projectile extends GoalControlledEntity {
  public static readonly kind = "projectile" as const;
  public previousX: number;
  public previousY: number;
  public readonly speed: number;
  public remainingRange: number;
  protected directionX: number;
  protected directionY: number;
  protected readonly hitEffects: readonly Effect[];
  protected remainingHits: number | null;
  private readonly hitTargetIds = new Set<number>();

  protected constructor(id: number, config: ProjectileSpawnConfig) {
    const baseline = requireEntityBaselineContent(
      (new.target as typeof Projectile).typeId,
    );
    super(id, { maxHp: baseline.maxHp });
    const definition = requireProjectileDefinition(
      this.constructor as Partial<ProjectileCtorWithDefinition>,
    );

    const directionLength =
      Math.hypot(config.directionX, config.directionY) || 1;
    this.directionX = config.directionX / directionLength;
    this.directionY = config.directionY / directionLength;
    this.ownerId = config.ownerId;
    this.x = config.x;
    this.y = config.y;
    this.previousX = config.x;
    this.previousY = config.y;
    this.speed = definition.speed;
    this.remainingRange = definition.range;
    this.rotation =
      config.rotation ?? Math.atan2(this.directionY, this.directionX);
    this.collisionMode = baseline.collisionMode;
    this.hitEffects = [...(definition.hitEffects ?? [])];
    this.setMovementTuning({
      driveAccelerationPerTick: this.speed,
      momentumCutoff: 0.25,
    });
    this.setHitboxProfiles(
      {
        default: cloneHitboxRects(definition.hitboxes),
      },
      "default",
    );
    this.remainingHits = normalizeMaxHits(definition.maxHits);
    this.setTravelDirection(this.directionX, this.directionY, config.rotation);
  }

  public override tick(world: World): void {
    this.previousX = this.x;
    this.previousY = this.y;
    if (!this.goalSelector.hasActiveControl("move")) {
      this.setDesiredVelocity(
        this.directionX * this.speed,
        this.directionY * this.speed,
      );
    }
    super.tick(world);
    if (!this.goalSelector.hasActiveControl("move")) {
      this.setDesiredVelocity(
        this.directionX * this.speed,
        this.directionY * this.speed,
      );
    }
    this.updateHeadingFromVelocity();
    this.x += this.vx;
    this.y += this.vy;
  }

  public override getCombatInstigator(world: World): CombatEntity | null {
    if (this.ownerId === undefined) {
      return null;
    }

    return world.get(this.ownerId) ?? null;
  }

  /**
   * Runs the projectile's post-move rules for this tick.
   * @param world World holding authoritative entities and combat state.
   * @returns True when the projectile should be despawned.
   */
  public resolvePostStep(world: World): boolean {
    const instigator = this.getCombatInstigator(world);
    if (!instigator) {
      return true;
    }

    const traveledDistance = Math.hypot(
      this.x - this.previousX,
      this.y - this.previousY,
    );
    this.remainingRange -= traveledDistance;
    if (this.remainingRange <= 0 || !this.isWithinWorldBounds(world)) {
      return true;
    }

    const impactResolution = projectileImpactResolver.resolve(
      world,
      this,
      this.hitTargetIds,
    );
    const targetsToHit = this.limitImpactTargets(
      impactResolution.targets.map(({ target }) => target),
    );
    if (targetsToHit.length === 0) {
      return impactResolution.blockedByBuilding;
    }

    for (const target of targetsToHit) {
      this.hitTargetIds.add(target.id);
      this.applyImpact(world, target);
    }
    if (this.remainingHits !== null) {
      this.remainingHits -= targetsToHit.length;
    }

    return (
      impactResolution.blockedByBuilding ||
      this.shouldDespawnAfterHit(targetsToHit)
    );
  }

  protected shouldDespawnAfterHit(
    _targetsHitThisStep: readonly CombatEntity[],
  ): boolean {
    return this.remainingHits !== null && this.remainingHits <= 0;
  }

  protected applyImpact(world: World, target: CombatEntity): void {
    for (const effect of this.hitEffects) {
      effect.apply(world, this, target);
    }
  }

  protected setTravelDirection(
    directionX: number,
    directionY: number,
    rotation = Math.atan2(directionY, directionX),
  ): void {
    const directionLength = Math.hypot(directionX, directionY) || 1;
    this.directionX = directionX / directionLength;
    this.directionY = directionY / directionLength;
    this.rotation = rotation;
    this.setDesiredVelocity(
      this.directionX * this.speed,
      this.directionY * this.speed,
    );
  }

  public override afterMovement(world: World): void {
    if (this.resolvePostStep(world)) {
      this.alive = false;
      world.despawn(this.id);
    }
  }

  public override toSnapshot(): ProjectileSnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "projectile",
    };
  }

  private limitImpactTargets(targets: readonly CombatEntity[]): CombatEntity[] {
    if (this.remainingHits === null) {
      return [...targets];
    }
    if (this.remainingHits <= 0) {
      return [];
    }

    return targets.slice(0, this.remainingHits);
  }

  private isWithinWorldBounds(world: World): boolean {
    const bounds = this.getWorldBounds();
    return !(
      bounds.maxX < 0 ||
      bounds.maxY < 0 ||
      bounds.minX > world.gameConfig.worldSize.w ||
      bounds.minY > world.gameConfig.worldSize.h
    );
  }

  private updateHeadingFromVelocity(): void {
    const currentSpeed = Math.hypot(this.vx, this.vy);
    if (currentSpeed <= Number.EPSILON) {
      return;
    }

    this.directionX = this.vx / currentSpeed;
    this.directionY = this.vy / currentSpeed;
    this.rotation = Math.atan2(this.directionY, this.directionX);
  }
}

function normalizeMaxHits(maxHits: number | null | undefined): number | null {
  if (maxHits === undefined) {
    return 1;
  }
  if (maxHits === null || !Number.isFinite(maxHits)) {
    return null;
  }
  return Math.max(1, Math.floor(maxHits));
}

function requireProjectileDefinition(
  projectileCtor: Partial<ProjectileCtorWithDefinition>,
): ProjectileDefinition {
  const definition = projectileCtor.definition;
  if (!definition) {
    throw new Error(
      "Expected projectile class to declare a static projectile definition.",
    );
  }
  if (!Number.isFinite(definition.speed) || definition.speed <= 0) {
    throw new Error("Projectile definition speed must be a positive number.");
  }
  if (!Number.isFinite(definition.range) || definition.range <= 0) {
    throw new Error("Projectile definition range must be a positive number.");
  }
  if (!Array.isArray(definition.hitboxes) || definition.hitboxes.length === 0) {
    throw new Error(
      "Projectile definition must declare at least one hitbox rectangle.",
    );
  }

  return definition;
}
