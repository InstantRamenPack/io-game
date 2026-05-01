import {
  type AxisSeparation,
  doResolvedRectSetsOverlap,
  getResolvedRectSetSeparation,
  getSweptResolvedRectSetIntersectionTime,
} from "@shared/geometry/collision.ts";
import {
  offsetHitboxBounds,
  type HitboxBounds,
  type ResolvedHitboxRect,
  resolveHitboxRects,
} from "@shared/geometry/hitbox.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import type { System } from "@server/systems/System.ts";
import type { StaticGeometryBlocker } from "@server/world/StaticGeometryIndex.ts";
import type { World } from "@server/world/World.ts";

type AxisNormal = { x: -1 | 0 | 1; y: -1 | 0 | 1 };
type AxisName = "x" | "y";
type MotionSnapshot = { x: number; y: number; vx: number; vy: number };
type StaticMoveResult = {
  moved: boolean;
  blockedX: boolean;
  blockedY: boolean;
  initialOverlapRecovered: boolean;
  blockerIds: number[];
  requestedDeltaX: number;
  requestedDeltaY: number;
  resolvedDeltaX: number;
  resolvedDeltaY: number;
};

const STATIC_SWEEP_SKIN = 0.001;
const STATIC_SWEEP_TOUCH_EPSILON = 0.01;
const STATIC_RECOVERY_PADDING = 2;
const MAX_STATIC_RECOVERY_STEPS = 8;

/**
 * Authoritative server collision pipeline.
 *
 * Dynamic entities are integrated through static blockers first, then remaining
 * dynamic/dynamic overlaps use the legacy even-split behavior.
 */
class CollisionSystem implements System {
  private readonly queryBuffer: Entity[] = [];
  private readonly staticQueryBuffer: StaticGeometryBlocker[] = [];
  private readonly worldHitboxCache = new Map<number, ResolvedHitboxRect[]>();
  private readonly worldBoundsCache = new Map<number, HitboxBounds>();

  public update(world: World): void {
    this.integrateAndResolve(world, world.entities.all());
  }

  public integrateAndResolve(world: World, tickPhaseEntities: Entity[]): void {
    this.worldHitboxCache.clear();
    this.worldBoundsCache.clear();
    world.ensureSpatialIndex();

    let movedEntity = false;
    for (const entity of tickPhaseEntities) {
      if (
        !world.entities.has(entity.id) ||
        entity.collisionMode !== "dynamic"
      ) {
        continue;
      }

      const result = this.integrateDynamicEntityAgainstStatic(world, entity);
      movedEntity = movedEntity || result.moved;
      if (result.moved) {
        this.recordStaticMove(world, entity, result);
      }
    }

    if (movedEntity) {
      world.markSpatialDirty();
      world.ensureSpatialIndex();
      this.worldHitboxCache.clear();
      this.worldBoundsCache.clear();
    }

    if (this.resolveDynamicPairs(world)) {
      world.markSpatialDirty();
      world.ensureSpatialIndex();
    }
  }

  private integrateDynamicEntityAgainstStatic(
    world: World,
    entity: Entity,
  ): StaticMoveResult {
    const startX = entity.x;
    const startY = entity.y;
    const requestedDeltaX = entity.vx;
    const requestedDeltaY = entity.vy;
    const blockerIds = world.focusedTrace.enabled ? new Set<number>() : null;
    let blockedX = false;
    let blockedY = false;

    const initialOverlapRecovered = this.recoverInitialStaticOverlap(
      world,
      entity,
      blockerIds,
    );

    if (requestedDeltaX !== 0) {
      const resolvedDeltaX = this.resolveStaticAxisDelta(
        world,
        entity,
        "x",
        requestedDeltaX,
        blockerIds,
      );
      entity.x += resolvedDeltaX;
      if (resolvedDeltaX !== requestedDeltaX) {
        blockedX = true;
        entity.clipVelocityAgainstNormal({
          x: Math.sign(requestedDeltaX) as -1 | 0 | 1,
          y: 0,
        });
      }
      this.invalidateEntityCaches(entity);
    }

    if (requestedDeltaY !== 0) {
      const resolvedDeltaY = this.resolveStaticAxisDelta(
        world,
        entity,
        "y",
        requestedDeltaY,
        blockerIds,
      );
      entity.y += resolvedDeltaY;
      if (resolvedDeltaY !== requestedDeltaY) {
        blockedY = true;
        entity.clipVelocityAgainstNormal({
          x: 0,
          y: Math.sign(requestedDeltaY) as -1 | 0 | 1,
        });
      }
      this.invalidateEntityCaches(entity);
    }

    const clamped = this.resolveWorldBounds(entity, world);
    if (clamped.clampedX) {
      blockedX = true;
    }
    if (clamped.clampedY) {
      blockedY = true;
    }

    return {
      moved: entity.x !== startX || entity.y !== startY,
      blockedX,
      blockedY,
      initialOverlapRecovered,
      blockerIds: blockerIds
        ? [...blockerIds].sort((left, right) => left - right)
        : [],
      requestedDeltaX,
      requestedDeltaY,
      resolvedDeltaX: entity.x - startX,
      resolvedDeltaY: entity.y - startY,
    };
  }

  private recoverInitialStaticOverlap(
    world: World,
    entity: Entity,
    blockerIds: Set<number> | null,
  ): boolean {
    let recovered = false;
    for (let step = 0; step < MAX_STATIC_RECOVERY_STEPS; step += 1) {
      const staticHitboxes = this.getOverlappingStaticHitboxes(
        world,
        entity,
        blockerIds,
      );
      if (staticHitboxes.length === 0) {
        return recovered;
      }

      const separation = getResolvedRectSetSeparation(
        this.getCachedWorldHitboxes(entity),
        staticHitboxes,
      );
      if (!separation || separation.translation === 0) {
        entity.clipVelocityAgainstNormal({ x: 1, y: 0 });
        entity.clipVelocityAgainstNormal({ x: -1, y: 0 });
        entity.clipVelocityAgainstNormal({ x: 0, y: 1 });
        entity.clipVelocityAgainstNormal({ x: 0, y: -1 });
        return recovered;
      }

      if (separation.axis === "x") {
        entity.x += separation.translation;
      } else {
        entity.y += separation.translation;
      }
      entity.clipVelocityAgainstNormal(
        this.getNormalFromTranslation(separation),
      );
      this.invalidateEntityCaches(entity);
      recovered = true;
    }

    return recovered;
  }

  private resolveStaticAxisDelta(
    world: World,
    entity: Entity,
    axis: AxisName,
    delta: number,
    blockerIds: Set<number> | null,
  ): number {
    if (delta === 0) {
      return 0;
    }

    const deltaX = axis === "x" ? delta : 0;
    const deltaY = axis === "y" ? delta : 0;
    const startX = entity.x;
    const startY = entity.y;
    const bounds = this.getSweptBounds(entity, startX, startY, deltaX, deltaY);
    const candidates = world.staticGeometry.queryBox(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
      this.staticQueryBuffer,
    );
    if (candidates.length === 0) {
      return delta;
    }

    const movingHitboxes = resolveHitboxRects(startX, startY, entity.hitboxes);
    let earliestHitTime: number | null = null;
    for (const candidate of candidates) {
      if (candidate.entityId === entity.id) {
        continue;
      }
      const hitTime = getSweptResolvedRectSetIntersectionTime(
        movingHitboxes,
        deltaX,
        deltaY,
        candidate.hitboxes,
      );
      if (hitTime === null) {
        continue;
      }
      if (earliestHitTime === null || hitTime < earliestHitTime) {
        earliestHitTime = hitTime;
      }
    }

    if (earliestHitTime === null) {
      return delta;
    }

    if (earliestHitTime <= STATIC_SWEEP_TOUCH_EPSILON) {
      const endHitboxes = resolveHitboxRects(
        startX + deltaX,
        startY + deltaY,
        entity.hitboxes,
      );
      const overlapsAtEnd = candidates.some((candidate) => {
        if (candidate.entityId === entity.id) {
          return false;
        }
        return doResolvedRectSetsOverlap(endHitboxes, candidate.hitboxes);
      });
      if (!overlapsAtEnd) {
        return delta;
      }
    }

    const safeHitTime = Math.max(
      0,
      Math.min(1, earliestHitTime - STATIC_SWEEP_SKIN),
    );
    for (const candidate of candidates) {
      if (candidate.entityId === entity.id) {
        continue;
      }
      const hitTime = getSweptResolvedRectSetIntersectionTime(
        movingHitboxes,
        deltaX,
        deltaY,
        candidate.hitboxes,
      );
      if (
        hitTime !== null &&
        Math.abs(hitTime - earliestHitTime) <= STATIC_SWEEP_TOUCH_EPSILON
      ) {
        blockerIds?.add(candidate.entityId);
      }
    }
    return delta * safeHitTime;
  }

  private getOverlappingStaticHitboxes(
    world: World,
    entity: Entity,
    blockerIds: Set<number> | null,
  ): ResolvedHitboxRect[] {
    const bounds = this.expandBounds(
      this.getCachedWorldBounds(entity),
      STATIC_RECOVERY_PADDING,
    );
    const candidates = world.staticGeometry.queryBox(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
      this.staticQueryBuffer,
    );
    const entityHitboxes = this.getCachedWorldHitboxes(entity);
    const staticHitboxes: ResolvedHitboxRect[] = [];
    for (const candidate of candidates) {
      if (candidate.entityId === entity.id) {
        continue;
      }
      const candidateHitboxes = candidate.hitboxes;
      if (!doResolvedRectSetsOverlap(entityHitboxes, candidateHitboxes)) {
        continue;
      }
      blockerIds?.add(candidate.entityId);
      staticHitboxes.push(...candidateHitboxes);
    }
    return staticHitboxes;
  }

  private resolveWorldBounds(
    entity: Entity,
    world: World,
  ): { clampedX: boolean; clampedY: boolean } {
    const bounds = entity.getHitboxBounds();
    const minX = -bounds.minX;
    const maxX = Math.max(minX, world.gameConfig.worldSize.w - bounds.maxX);
    const minY = -bounds.minY;
    const maxY = Math.max(minY, world.gameConfig.worldSize.h - bounds.maxY);
    const before = this.snapshotMotion(entity);
    let clampedX = false;
    let clampedY = false;

    if (entity.x < minX) {
      entity.x = minX;
      clampedX = true;
      entity.clipVelocityAgainstNormal({ x: -1, y: 0 });
    } else if (entity.x > maxX) {
      entity.x = maxX;
      clampedX = true;
      entity.clipVelocityAgainstNormal({ x: 1, y: 0 });
    }

    if (entity.y < minY) {
      entity.y = minY;
      clampedY = true;
      entity.clipVelocityAgainstNormal({ x: 0, y: -1 });
    } else if (entity.y > maxY) {
      entity.y = maxY;
      clampedY = true;
      entity.clipVelocityAgainstNormal({ x: 0, y: 1 });
    }

    if (clampedX || clampedY) {
      world.focusedTrace.recordEntityEvent(
        world,
        "world_bounds_clamp",
        entity,
        {
          before,
          after: this.snapshotMotion(entity),
          clampedX,
          clampedY,
          minX,
          maxX,
          minY,
          maxY,
        },
      );
      this.invalidateEntityCaches(entity);
    }

    return { clampedX, clampedY };
  }

  private resolveDynamicPairs(world: World): boolean {
    let resolvedCollision = false;
    for (const entity of world.entities.collidable()) {
      if (entity.collisionMode !== "dynamic") {
        continue;
      }

      const bounds = this.getCachedWorldBounds(entity);
      const candidates = world.spatial.queryBox(
        bounds.minX,
        bounds.minY,
        bounds.maxX,
        bounds.maxY,
        this.queryBuffer,
      );

      for (const candidate of candidates) {
        if (
          candidate.id === entity.id ||
          candidate.collisionMode !== "dynamic"
        ) {
          continue;
        }
        if (candidate.id < entity.id) {
          continue;
        }
        if (!this.shouldResolveCollisionPair(entity, candidate)) {
          continue;
        }

        const separation = this.getSeparation(entity, candidate);
        if (!separation) {
          continue;
        }
        this.separateDynamicDynamic(world, entity, candidate, separation);
        resolvedCollision = true;
        this.invalidateEntityCaches(entity);
        this.invalidateEntityCaches(candidate);
      }
    }
    return resolvedCollision;
  }

  private shouldResolveCollisionPair(
    leftEntity: Entity,
    rightEntity: Entity,
  ): boolean {
    const leftIsItemEntity = leftEntity instanceof ItemEntity;
    const rightIsItemEntity = rightEntity instanceof ItemEntity;
    if (!leftIsItemEntity && !rightIsItemEntity) {
      return true;
    }
    if (leftIsItemEntity && rightIsItemEntity) {
      return !leftEntity.canMergeStackableWith(rightEntity);
    }
    return false;
  }

  private separateDynamicDynamic(
    world: World,
    leftEntity: Entity,
    rightEntity: Entity,
    separation: AxisSeparation,
  ): void {
    const leftBefore = this.snapshotMotion(leftEntity);
    const rightBefore = this.snapshotMotion(rightEntity);
    const correction = separation.translation / 2;
    if (separation.axis === "x") {
      leftEntity.x += correction;
      rightEntity.x -= correction;
    } else {
      leftEntity.y += correction;
      rightEntity.y -= correction;
    }

    world.focusedTrace.recordEntityEvent(
      world,
      "entity_collision_resolved",
      leftEntity,
      {
        mode: "dynamic_dynamic",
        separation,
        before: leftBefore,
        after: this.snapshotMotion(leftEntity),
        counterpart: this.describeEntityRef(rightEntity),
        counterpartBefore: rightBefore,
        counterpartAfter: this.snapshotMotion(rightEntity),
      },
    );
    world.focusedTrace.recordEntityEvent(
      world,
      "entity_collision_resolved",
      rightEntity,
      {
        mode: "dynamic_dynamic",
        separation: this.invertSeparation(separation),
        before: rightBefore,
        after: this.snapshotMotion(rightEntity),
        counterpart: this.describeEntityRef(leftEntity),
        counterpartBefore: leftBefore,
        counterpartAfter: this.snapshotMotion(leftEntity),
      },
    );
  }

  private getSeparation(
    leftEntity: Entity,
    rightEntity: Entity,
  ): AxisSeparation | null {
    const leftBounds = this.getCachedWorldBounds(leftEntity);
    const rightBounds = this.getCachedWorldBounds(rightEntity);
    if (
      leftBounds.maxX <= rightBounds.minX ||
      leftBounds.minX >= rightBounds.maxX ||
      leftBounds.maxY <= rightBounds.minY ||
      leftBounds.minY >= rightBounds.maxY
    ) {
      return null;
    }

    return getResolvedRectSetSeparation(
      this.getCachedWorldHitboxes(leftEntity),
      this.getCachedWorldHitboxes(rightEntity),
    );
  }

  private recordStaticMove(
    world: World,
    entity: Entity,
    result: StaticMoveResult,
  ): void {
    if (!world.focusedTrace.enabled) {
      return;
    }
    if (
      !result.blockedX &&
      !result.blockedY &&
      !result.initialOverlapRecovered &&
      result.blockerIds.length === 0
    ) {
      return;
    }

    world.focusedTrace.recordEntityEvent(
      world,
      "entity_collision_resolved",
      entity,
      {
        mode: "dynamic_static",
        blockerIds: result.blockerIds,
        requestedDelta: {
          x: result.requestedDeltaX,
          y: result.requestedDeltaY,
        },
        resolvedDelta: {
          x: result.resolvedDeltaX,
          y: result.resolvedDeltaY,
        },
        normal: {
          x:
            result.blockedX && result.requestedDeltaX !== 0
              ? Math.sign(result.requestedDeltaX)
              : 0,
          y:
            result.blockedY && result.requestedDeltaY !== 0
              ? Math.sign(result.requestedDeltaY)
              : 0,
        },
        initialOverlapRecovered: result.initialOverlapRecovered,
      },
    );
  }

  private getSweptBounds(
    entity: Entity,
    fromX: number,
    fromY: number,
    deltaX: number,
    deltaY: number,
  ): HitboxBounds {
    const currentBounds = offsetHitboxBounds(
      entity.getHitboxBounds(),
      fromX,
      fromY,
    );
    const nextBounds = offsetHitboxBounds(
      entity.getHitboxBounds(),
      fromX + deltaX,
      fromY + deltaY,
    );
    return this.makeBounds(
      Math.min(currentBounds.minX, nextBounds.minX),
      Math.min(currentBounds.minY, nextBounds.minY),
      Math.max(currentBounds.maxX, nextBounds.maxX),
      Math.max(currentBounds.maxY, nextBounds.maxY),
    );
  }

  private expandBounds(bounds: HitboxBounds, padding: number): HitboxBounds {
    return this.makeBounds(
      bounds.minX - padding,
      bounds.minY - padding,
      bounds.maxX + padding,
      bounds.maxY + padding,
    );
  }

  private makeBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): HitboxBounds {
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: minX + (maxX - minX) / 2,
      centerY: minY + (maxY - minY) / 2,
    };
  }

  private invertSeparation(separation: AxisSeparation): AxisSeparation {
    return {
      axis: separation.axis,
      translation: -separation.translation,
    };
  }

  private getNormalFromTranslation(separation: AxisSeparation): AxisNormal {
    if (separation.axis === "x") {
      return {
        x: separation.translation < 0 ? 1 : -1,
        y: 0,
      };
    }

    return {
      x: 0,
      y: separation.translation < 0 ? 1 : -1,
    };
  }

  private snapshotMotion(entity: Entity): MotionSnapshot {
    return {
      x: entity.x,
      y: entity.y,
      vx: entity.vx,
      vy: entity.vy,
    };
  }

  private describeEntityRef(entity: Entity): {
    id: number;
    typeId: string;
    className: string;
    kind: string | null;
  } {
    const ctor = entity.constructor as typeof Entity & {
      readonly kind?: string;
    };
    return {
      id: entity.id,
      typeId: entity.typeId,
      className: entity.constructor.name,
      kind: ctor.kind ?? null,
    };
  }

  private getCachedWorldHitboxes(entity: Entity): ResolvedHitboxRect[] {
    const cached = this.worldHitboxCache.get(entity.id);
    if (cached) {
      return cached;
    }

    const hitboxes = entity.getWorldHitboxes();
    this.worldHitboxCache.set(entity.id, hitboxes);
    return hitboxes;
  }

  private getCachedWorldBounds(entity: Entity): HitboxBounds {
    const cached = this.worldBoundsCache.get(entity.id);
    if (cached) {
      return cached;
    }

    const bounds = entity.getWorldBounds();
    this.worldBoundsCache.set(entity.id, bounds);
    return bounds;
  }

  private invalidateEntityCaches(entity: Entity): void {
    this.worldHitboxCache.delete(entity.id);
    this.worldBoundsCache.delete(entity.id);
  }
}

export default CollisionSystem;
