import type { Entity as CombatEntity } from "@server/entities/Entity.ts";
import { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import type { World } from "@server/world/World.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { ProjectileSnapshot } from "@shared/net/snapshots.ts";

export type ProjectileSpawnConfig = {
  ownerId: number;
  x: number;
  y: number;
  directionX: number;
  directionY: number;
  speed: number;
  range: number;
  rotation?: number;
  radius?: number;
  hitEffects?: readonly Effect[];
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
  protected readonly directionX: number;
  protected readonly directionY: number;

  protected constructor(
    id: number,
    config: ProjectileSpawnConfig,
  ) {
    super(id);

    const directionLength =
      Math.hypot(config.directionX, config.directionY) || 1;
    this.directionX = config.directionX / directionLength;
    this.directionY = config.directionY / directionLength;
    this.ownerId = config.ownerId;
    this.x = config.x;
    this.y = config.y;
    this.previousX = config.x;
    this.previousY = config.y;
    this.speed = config.speed;
    this.remainingRange = config.range;
    this.radius = config.radius ?? 4;
    this.rotation =
      config.rotation ?? Math.atan2(this.directionY, this.directionX);
    this.collisionMode = "none";
    this.setMovementVelocity(
      this.directionX * this.speed,
      this.directionY * this.speed,
    );
  }

  public override tick(world: World): void {
    this.previousX = this.x;
    this.previousY = this.y;
    super.tick(world);
    if (!this.goalSelector.hasActiveControl("move")) {
      this.setMovementVelocity(
        this.directionX * this.speed,
        this.directionY * this.speed,
      );
    }
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

    const target = this.resolveImpactTarget(world);
    if (!target) {
      return false;
    }

    this.applyImpact(world, target);
    return this.shouldDespawnAfterHit();
  }

  protected shouldDespawnAfterHit(): boolean {
    return true;
  }

  protected abstract applyImpact(world: World, target: CombatEntity): void;

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

  private resolveImpactTarget(world: World): CombatEntity | null {
    const minX = Math.min(this.previousX, this.x) - this.radius;
    const minY = Math.min(this.previousY, this.y) - this.radius;
    const maxX = Math.max(this.previousX, this.x) + this.radius;
    const maxY = Math.max(this.previousY, this.y) + this.radius;

    let bestTarget: CombatEntity | null = null;
    let bestHitTime = Number.POSITIVE_INFINITY;

    for (const candidate of world.spatial.queryBox(minX, minY, maxX, maxY)) {
      if (candidate.id === this.id) {
        continue;
      }
      if (!world.combat.canAttackTarget(world, this, candidate)) {
        continue;
      }

      const hitTime = this.getSegmentHitTime(candidate);
      if (hitTime === null || hitTime >= bestHitTime) {
        continue;
      }

      bestTarget = candidate;
      bestHitTime = hitTime;
    }

    return bestTarget;
  }

  private getSegmentHitTime(target: CombatEntity): number | null {
    const deltaX = this.x - this.previousX;
    const deltaY = this.y - this.previousY;
    const padding = target.radius + this.radius;

    const targetMinX = target.x - padding;
    const targetMaxX = target.x + padding;
    const targetMinY = target.y - padding;
    const targetMaxY = target.y + padding;

    let entryTime = 0;
    let exitTime = 1;

    const xResult = this.updateAxisIntersection(
      this.previousX,
      deltaX,
      targetMinX,
      targetMaxX,
      entryTime,
      exitTime,
    );
    if (!xResult) {
      return null;
    }
    entryTime = xResult.entryTime;
    exitTime = xResult.exitTime;

    const yResult = this.updateAxisIntersection(
      this.previousY,
      deltaY,
      targetMinY,
      targetMaxY,
      entryTime,
      exitTime,
    );
    if (!yResult) {
      return null;
    }

    return yResult.entryTime;
  }

  private updateAxisIntersection(
    origin: number,
    delta: number,
    min: number,
    max: number,
    currentEntryTime: number,
    currentExitTime: number,
  ): { entryTime: number; exitTime: number } | null {
    if (Math.abs(delta) < Number.EPSILON) {
      if (origin < min || origin > max) {
        return null;
      }
      return {
        entryTime: currentEntryTime,
        exitTime: currentExitTime,
      };
    }

    const inverseDelta = 1 / delta;
    let axisEntryTime = (min - origin) * inverseDelta;
    let axisExitTime = (max - origin) * inverseDelta;

    if (axisEntryTime > axisExitTime) {
      [axisEntryTime, axisExitTime] = [axisExitTime, axisEntryTime];
    }

    const entryTime = Math.max(currentEntryTime, axisEntryTime);
    const exitTime = Math.min(currentExitTime, axisExitTime);
    if (entryTime > exitTime || exitTime < 0 || entryTime > 1) {
      return null;
    }

    return {
      entryTime,
      exitTime,
    };
  }

  private isWithinWorldBounds(world: World): boolean {
    return !(
      this.x < -this.radius ||
      this.y < -this.radius ||
      this.x > world.gameConfig.worldSize.w + this.radius ||
      this.y > world.gameConfig.worldSize.h + this.radius
    );
  }
}
