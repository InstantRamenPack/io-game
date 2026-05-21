import {
  getDistanceSquaredToResolvedRectSet,
  getSweptResolvedRectSetIntersectionTime,
} from "@shared/geometry/collision.ts";
import {
  offsetHitboxBounds,
  resolveHitboxRects,
} from "@shared/geometry/hitbox.ts";
import { COMBAT_OCCLUSION_EPSILON } from "@server/combat/CombatOcclusion.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { Projectile } from "@server/entities/Projectile.ts";
import type { World } from "@server/world/World.ts";

type ProjectileImpactTarget = {
  target: Entity;
  hitTime: number;
  distanceSquaredFromPrevious: number;
  tieBreakerDistanceSquared: number;
};

export type ProjectileImpactResolution = {
  blockedByBuilding: boolean;
  targets: ProjectileImpactTarget[];
};

/**
 * Resolves swept projectile impacts against both attackable targets and blockers.
 */
export class ProjectileImpactResolver {
  public resolve(
    world: World,
    projectile: Projectile,
    ignoredTargetIds: ReadonlySet<number>,
  ): ProjectileImpactResolution {
    const previousBounds = offsetHitboxBounds(
      projectile.getHitboxBounds(),
      projectile.previousX,
      projectile.previousY,
    );
    const currentBounds = projectile.getWorldBounds();
    const minX = Math.min(previousBounds.minX, currentBounds.minX);
    const minY = Math.min(previousBounds.minY, currentBounds.minY);
    const maxX = Math.max(previousBounds.maxX, currentBounds.maxX);
    const maxY = Math.max(previousBounds.maxY, currentBounds.maxY);
    const deltaX = projectile.x - projectile.previousX;
    const deltaY = projectile.y - projectile.previousY;
    const movingHitboxes = resolveHitboxRects(
      projectile.previousX,
      projectile.previousY,
      projectile.hitboxes,
    );
    const impacts: ProjectileImpactTarget[] = [];
    let nearestBlockingHitTime: number | null = null;

    for (const blocker of world.staticGeometry.queryBox(
      minX,
      minY,
      maxX,
      maxY,
    )) {
      const hitTime = getSweptResolvedRectSetIntersectionTime(
        movingHitboxes,
        deltaX,
        deltaY,
        blocker.hitboxes,
      );
      if (
        hitTime !== null &&
        (nearestBlockingHitTime === null || hitTime < nearestBlockingHitTime)
      ) {
        nearestBlockingHitTime = hitTime;
      }
    }

    for (const candidate of world.spatial.queryBox(minX, minY, maxX, maxY)) {
      const hitTime = this.resolveHitTime(
        projectile,
        candidate,
        movingHitboxes,
        deltaX,
        deltaY,
      );
      if (hitTime === null) {
        continue;
      }

      if (
        ignoredTargetIds.has(candidate.id) ||
        !DamageEffect.canApply(world, projectile, candidate)
      ) {
        continue;
      }

      impacts.push({
        target: candidate,
        hitTime,
        distanceSquaredFromPrevious:
          (deltaX * deltaX + deltaY * deltaY) * hitTime * hitTime,
        tieBreakerDistanceSquared: getDistanceSquaredToResolvedRectSet(
          candidate.getWorldHitboxes(),
          projectile.previousX,
          projectile.previousY,
        ),
      });
    }

    impacts.sort((left, right) => {
      if (left.hitTime !== right.hitTime) {
        return left.hitTime - right.hitTime;
      }
      if (
        left.distanceSquaredFromPrevious !== right.distanceSquaredFromPrevious
      ) {
        return (
          left.distanceSquaredFromPrevious - right.distanceSquaredFromPrevious
        );
      }
      if (left.tieBreakerDistanceSquared !== right.tieBreakerDistanceSquared) {
        return left.tieBreakerDistanceSquared - right.tieBreakerDistanceSquared;
      }
      return left.target.id - right.target.id;
    });

    const maxVisibleHitTime =
      nearestBlockingHitTime === null
        ? null
        : nearestBlockingHitTime + COMBAT_OCCLUSION_EPSILON;
    const visibleTargets =
      maxVisibleHitTime === null
        ? impacts
        : impacts.filter((impact) => impact.hitTime <= maxVisibleHitTime);

    return {
      blockedByBuilding: nearestBlockingHitTime !== null,
      targets: visibleTargets,
    };
  }

  private resolveHitTime(
    projectile: Projectile,
    candidate: Entity,
    movingHitboxes: ReturnType<typeof resolveHitboxRects>,
    deltaX: number,
    deltaY: number,
  ): number | null {
    if (candidate.id === projectile.id || !candidate.alive) {
      return null;
    }

    return getSweptResolvedRectSetIntersectionTime(
      movingHitboxes,
      deltaX,
      deltaY,
      candidate.getWorldHitboxes(),
    );
  }
}

export const projectileImpactResolver = new ProjectileImpactResolver();
