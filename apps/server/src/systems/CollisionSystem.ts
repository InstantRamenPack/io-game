import {
  type AxisSeparation,
  getResolvedRectSetSeparation,
} from "@shared/geometry/collision.ts";
import {
  type HitboxBounds,
  type ResolvedHitboxRect,
  resolveHitboxRects,
} from "@shared/geometry/hitbox.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

type AxisNormal = { x: -1 | 0 | 1; y: -1 | 0 | 1 };
type CollisionSide = "left" | "right" | "top" | "bottom";
const MAX_COLLISION_PASSES = 3;

/**
 * Resolves composite entity overlap and world-boundary clamping.
 * Collision is kept authoritative and axis-aligned on the server.
 */
class CollisionSystem implements System {
  private readonly queryBuffer: Entity[] = [];
  private readonly worldHitboxCache = new Map<number, ResolvedHitboxRect[]>();
  private readonly worldBoundsCache = new Map<number, HitboxBounds>();

  /**
   * Resolves nearby overlaps using the prebuilt broad-phase index, then clamps bodies to world bounds.
   * @param world Authoritative world being simulated.
   */
  public update(world: World): void {
    this.worldHitboxCache.clear();
    this.worldBoundsCache.clear();
    let spatialDirty = false;

    for (let pass = 0; pass < MAX_COLLISION_PASSES; pass += 1) {
      const collidableEntities = world.entities.collidable();
      let resolvedCollision = false;
      let passChangedPositions = false;

      for (const entity of collidableEntities) {
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
            candidate.collisionMode === "none"
          ) {
            continue;
          }
          if (!this.shouldResolveCollisionPair(entity, candidate)) {
            continue;
          }
          if (
            candidate.collisionMode === "dynamic" &&
            candidate.id < entity.id
          ) {
            continue;
          }
          const pairResolved = this.resolveEntityPair(world, entity, candidate);
          if (pairResolved) {
            resolvedCollision = true;
            passChangedPositions = true;
            this.invalidateEntityCaches(entity);
            this.invalidateEntityCaches(candidate);
          }
        }
      }

      if (!resolvedCollision) {
        break;
      }

      if (passChangedPositions) {
        spatialDirty = true;
      }
      if (pass < MAX_COLLISION_PASSES - 1) {
        if (passChangedPositions) {
          world.markSpatialDirty();
          world.ensureSpatialIndex();
          spatialDirty = false;
        }
      }
    }

    const collidableEntities = world.entities.collidable();
    for (const entity of collidableEntities) {
      if (this.resolveWorldBounds(entity, world)) {
        spatialDirty = true;
        this.invalidateEntityCaches(entity);
      }
    }

    if (spatialDirty) {
      world.markSpatialDirty();
      world.ensureSpatialIndex();
    }
  }

  /**
   * Clamps one collidable entity into the world rectangle and removes outward velocity.
   * @param entity Entity being clamped.
   * @param world World providing the authoritative bounds.
   */
  private resolveWorldBounds(entity: Entity, world: World): boolean {
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
    }

    return clampedX || clampedY;
  }

  /**
   * Resolves one pair of potentially colliding composite bodies.
   * @param world
   * @param leftEntity First body.
   * @param rightEntity Second body.
   */
  private resolveEntityPair(
    world: World,
    leftEntity: Entity,
    rightEntity: Entity,
  ): boolean {
    if (!this.shouldResolveCollisionPair(leftEntity, rightEntity)) {
      return false;
    }

    if (
      leftEntity.collisionMode === "static" &&
      rightEntity.collisionMode === "static"
    ) {
      return false;
    }

    const separation = this.getSeparation(leftEntity, rightEntity);
    if (!separation) {
      return false;
    }

    if (
      leftEntity.collisionMode === "dynamic" &&
      rightEntity.collisionMode === "dynamic"
    ) {
      this.separateDynamicDynamic(world, leftEntity, rightEntity, separation);
      return true;
    }

    if (leftEntity.collisionMode === "dynamic") {
      this.separateDynamicStatic(world, leftEntity, rightEntity, separation);
      return true;
    }

    if (rightEntity.collisionMode === "dynamic") {
      this.separateDynamicStatic(
        world,
        rightEntity,
        leftEntity,
        this.invertSeparation(separation),
      );
      return true;
    }

    return false;
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

  /**
   * Separates two dynamic bodies evenly and removes inward velocity.
   * @param world
   * @param leftEntity First dynamic body.
   * @param rightEntity Second dynamic body.
   * @param separation Translation that would resolve the pair by moving the left body alone.
   */
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

  /**
   * Separates a dynamic body away from a static body and removes inward velocity.
   * @param world
   * @param dynamicEntity Dynamic body that should move.
   * @param staticEntity Static body that shouldn't move.
   * @param separation Translation required to resolve the overlap.
   */
  private separateDynamicStatic(
    world: World,
    dynamicEntity: Entity,
    staticEntity: Entity,
    separation: AxisSeparation,
  ): void {
    const before = this.snapshotMotion(dynamicEntity);
    const resolvedSeparation =
      this.getMovementAwareStaticSeparation(world, dynamicEntity, staticEntity) ??
      separation;
    if (resolvedSeparation.axis === "x") {
      dynamicEntity.x += resolvedSeparation.translation;
    } else {
      dynamicEntity.y += resolvedSeparation.translation;
    }

    dynamicEntity.clipVelocityAgainstNormal(
      this.getNormalFromTranslation(resolvedSeparation),
    );
    world.focusedTrace.recordEntityEvent(
      world,
      "entity_collision_resolved",
      dynamicEntity,
      {
        mode: "dynamic_static",
        separation: resolvedSeparation,
        before,
        after: this.snapshotMotion(dynamicEntity),
        counterpart: this.describeEntityRef(staticEntity),
      },
    );
  }

  /**
   * Chooses the smallest axis-aligned translation that clears all overlapping rect pairs.
   * @param leftEntity First body.
   * @param rightEntity Second body.
   * @returns Translation for the left body, or null when the bodies do not overlap.
   */
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

    const leftHitboxes = this.getCachedWorldHitboxes(leftEntity);
    const rightHitboxes = this.getCachedWorldHitboxes(rightEntity);
    return getResolvedRectSetSeparation(leftHitboxes, rightHitboxes);
  }

  private getMovementAwareStaticSeparation(
    world: World,
    dynamicEntity: Entity,
    staticEntity: Entity,
  ): AxisSeparation | null {
    const previousPosition = world.getLastIntegratedPosition(dynamicEntity);
    if (!previousPosition) {
      return null;
    }

    const previousHitboxes = resolveHitboxRects(
      previousPosition.x,
      previousPosition.y,
      dynamicEntity.hitboxes,
    );
    const currentHitboxes = this.getCachedWorldHitboxes(dynamicEntity);
    const staticHitboxes = this.getCachedWorldHitboxes(staticEntity);
    const enteredSides = new Map<CollisionSide, AxisSeparation>();

    for (const currentRect of currentHitboxes) {
      for (const staticRect of staticHitboxes) {
        if (!this.doRectsOverlap(currentRect, staticRect)) {
          continue;
        }

        const previousRect = previousHitboxes.find(
          (candidate) =>
            candidate.width === currentRect.width &&
            candidate.height === currentRect.height &&
            candidate.offsetX === currentRect.offsetX &&
            candidate.offsetY === currentRect.offsetY,
        );
        if (!previousRect) {
          continue;
        }

        this.recordEnteredSide(
          enteredSides,
          "left",
          previousRect.maxX <= staticRect.minX,
          { axis: "x", translation: staticRect.minX - currentRect.maxX },
        );
        this.recordEnteredSide(
          enteredSides,
          "right",
          previousRect.minX >= staticRect.maxX,
          { axis: "x", translation: staticRect.maxX - currentRect.minX },
        );
        this.recordEnteredSide(
          enteredSides,
          "top",
          previousRect.maxY <= staticRect.minY,
          { axis: "y", translation: staticRect.minY - currentRect.maxY },
        );
        this.recordEnteredSide(
          enteredSides,
          "bottom",
          previousRect.minY >= staticRect.maxY,
          { axis: "y", translation: staticRect.maxY - currentRect.minY },
        );
      }
    }

    return this.chooseMovementAwareSeparation(
      enteredSides,
      dynamicEntity.x - previousPosition.x,
      dynamicEntity.y - previousPosition.y,
    );
  }

  private recordEnteredSide(
    enteredSides: Map<CollisionSide, AxisSeparation>,
    side: CollisionSide,
    didEnterFromSide: boolean,
    separation: AxisSeparation,
  ): void {
    if (!didEnterFromSide || separation.translation === 0) {
      return;
    }

    const existing = enteredSides.get(side);
    if (
      !existing ||
      Math.abs(separation.translation) > Math.abs(existing.translation)
    ) {
      enteredSides.set(side, separation);
    }
  }

  private chooseMovementAwareSeparation(
    enteredSides: Map<CollisionSide, AxisSeparation>,
    deltaX: number,
    deltaY: number,
  ): AxisSeparation | null {
    if (enteredSides.size === 0) {
      return null;
    }

    const preferredAxis =
      Math.abs(deltaX) >= Math.abs(deltaY) && deltaX !== 0 ? "x" : "y";
    const candidates = [...enteredSides.values()];
    const preferredCandidates = candidates.filter(
      (candidate) => candidate.axis === preferredAxis,
    );
    const search = preferredCandidates.length > 0 ? preferredCandidates : candidates;
    let best = search[0] ?? null;
    for (const candidate of search.slice(1)) {
      if (!best || Math.abs(candidate.translation) < Math.abs(best.translation)) {
        best = candidate;
      }
    }
    return best;
  }

  private doRectsOverlap(
    leftRect: ResolvedHitboxRect,
    rightRect: ResolvedHitboxRect,
  ): boolean {
    return (
      leftRect.minX < rightRect.maxX &&
      leftRect.maxX > rightRect.minX &&
      leftRect.minY < rightRect.maxY &&
      leftRect.maxY > rightRect.minY
    );
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

  private invertNormal(normal: AxisNormal): AxisNormal {
    return {
      x: (normal.x * -1) as -1 | 0 | 1,
      y: (normal.y * -1) as -1 | 0 | 1,
    };
  }

  private snapshotMotion(entity: Entity): {
    x: number;
    y: number;
    vx: number;
    vy: number;
  } {
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
