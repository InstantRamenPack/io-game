import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import type { Entity } from "@server/entities/Entity.ts";
import {
  AreaEffect,
  type AreaEffectOrigin,
} from "@server/effects/area/AreaEffect.ts";
import type { World } from "@server/world/World.ts";

/**
 * Per-target hit data derived from a radial area effect query.
 */
export type RadialAreaEffectHitContext = {
  originX: number;
  originY: number;
  radius: number;
  distance: number;
  distanceRatio: number;
};

/**
 * Shared radial AoE executor that resolves nearby targets from the spatial index.
 */
export abstract class RadialAreaEffect extends AreaEffect {
  protected abstract readonly radius: number;
  private readonly candidateBuffer: Entity[] = [];

  /**
   * Resolves nearby targets and applies radial hit logic at the provided origin.
   */
  public override apply(
    world: World,
    source: Entity,
    origin: AreaEffectOrigin,
  ): void {
    if (
      !Number.isFinite(origin.x) ||
      !Number.isFinite(origin.y) ||
      !Number.isFinite(this.radius) ||
      this.radius <= 0
    ) {
      return;
    }

    this.beforeApply(world, source, origin);

    const candidates = world.spatial.queryBox(
      origin.x - this.radius,
      origin.y - this.radius,
      origin.x + this.radius,
      origin.y + this.radius,
      this.candidateBuffer,
    );
    for (const target of candidates) {
      if (!this.isTargetEligible(world, source, target)) {
        continue;
      }

      const distance = Math.sqrt(
        getDistanceSquaredToResolvedRectSet(
          target.getWorldHitboxes(),
          origin.x,
          origin.y,
        ),
      );
      if (distance > this.radius) {
        continue;
      }

      this.applyToTarget(world, source, target, {
        originX: origin.x,
        originY: origin.y,
        radius: this.radius,
        distance,
        distanceRatio: Math.min(1, distance / this.radius),
      });
    }

    this.afterApply(world, source, origin);
  }

  /**
   * Optional hook run before any target resolution occurs.
   */
  protected beforeApply(
    _world: World,
    _source: Entity,
    _origin: AreaEffectOrigin,
  ): void {}

  /**
   * Optional hook run after the target loop completes.
   */
  protected afterApply(
    _world: World,
    _source: Entity,
    _origin: AreaEffectOrigin,
  ): void {}

  /**
   * Returns whether a queried entity should be affected.
   */
  protected isTargetEligible(
    _world: World,
    _source: Entity,
    target: Entity,
  ): boolean {
    return target.alive;
  }

  /**
   * Applies this effect's per-target logic once a hit has been resolved.
   */
  protected abstract applyToTarget(
    world: World,
    source: Entity,
    target: Entity,
    hitContext: RadialAreaEffectHitContext,
  ): void;
}
