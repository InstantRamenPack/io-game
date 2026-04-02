import {
  type AxisSeparation,
  getResolvedRectSetSeparation,
  getSweptResolvedRectSetIntersectionTime,
} from "@shared/geometry/collision.ts";
import {
  offsetHitboxBounds,
  resolveHitboxRects,
} from "@shared/geometry/hitbox.ts";
import { canAttackTarget } from "@server/combat/combatRules.ts";
import { Building } from "@server/entities/Building.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Projectile } from "@server/entities/Projectile.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

type AxisNormal = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

/**
 * Resolves composite entity overlap and world-boundary clamping.
 * Collision is kept authoritative and axis-aligned on the server.
 */
class CollisionSystem implements System {
  private readonly queryBuffer: Entity[] = [];

  /**
   * Resolves nearby overlaps using the prebuilt broad-phase index, then clamps bodies to world bounds.
   * @param world Authoritative world being simulated.
   */
  public update(world: World): void {
    const collidableEntities = world.entities.collidable();

    for (const entity of collidableEntities) {
      if (entity.collisionMode !== "dynamic") {
        continue;
      }

      const bounds = entity.getWorldBounds();
      const candidates = world.spatial.queryBox(
        bounds.minX,
        bounds.minY,
        bounds.maxX,
        bounds.maxY,
        this.queryBuffer,
      );

      for (const candidate of candidates) {
        if (candidate.id === entity.id) {
          continue;
        }
        if (candidate.collisionMode === "dynamic" && candidate.id < entity.id) {
          continue;
        }
        this.resolveEntityPair(world, entity, candidate);
      }
    }

    for (const entity of collidableEntities) {
      this.resolveWorldBounds(entity, world);
    }

    this.resolveProjectileBuildingCollisions(world);
  }

  /**
   * Clamps one collidable entity into the world rectangle and removes outward velocity.
   * @param entity Entity being clamped.
   * @param world World providing the authoritative bounds.
   */
  private resolveWorldBounds(entity: Entity, world: World): void {
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
      if (entity.vx < 0) {
        entity.vx = 0;
      }
    } else if (entity.x > maxX) {
      entity.x = maxX;
      clampedX = true;
      if (entity.vx > 0) {
        entity.vx = 0;
      }
    }

    if (entity.y < minY) {
      entity.y = minY;
      clampedY = true;
      if (entity.vy < 0) {
        entity.vy = 0;
      }
    } else if (entity.y > maxY) {
      entity.y = maxY;
      clampedY = true;
      if (entity.vy > 0) {
        entity.vy = 0;
      }
    }

    if (clampedX || clampedY) {
      world.focusedTrace.recordEntityEvent(world, "world_bounds_clamp", entity, {
        before,
        after: this.snapshotMotion(entity),
        clampedX,
        clampedY,
        minX,
        maxX,
        minY,
        maxY,
      });
    }
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
  ): void {
    if (
      leftEntity.collisionMode === "static" &&
      rightEntity.collisionMode === "static"
    ) {
      return;
    }

    const separation = this.getSeparation(leftEntity, rightEntity);
    if (!separation) {
      return;
    }

    if (
      leftEntity.collisionMode === "dynamic" &&
      rightEntity.collisionMode === "dynamic"
    ) {
      this.separateDynamicDynamic(world, leftEntity, rightEntity, separation);
      return;
    }

    if (leftEntity.collisionMode === "dynamic") {
      this.separateDynamicStatic(world, leftEntity, rightEntity, separation);
      return;
    }

    if (rightEntity.collisionMode === "dynamic") {
      this.separateDynamicStatic(
        world,
        rightEntity,
        leftEntity,
        this.invertSeparation(separation),
      );
    }
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

    const normal = this.getNormalFromTranslation(separation);
    this.removeInwardVelocity(leftEntity, normal);
    this.removeInwardVelocity(rightEntity, this.invertNormal(normal));
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
    if (separation.axis === "x") {
      dynamicEntity.x += separation.translation;
    } else {
      dynamicEntity.y += separation.translation;
    }

    this.removeInwardVelocity(
      dynamicEntity,
      this.getNormalFromTranslation(separation),
    );
    world.focusedTrace.recordEntityEvent(
      world,
      "entity_collision_resolved",
      dynamicEntity,
      {
        mode: "dynamic_static",
        separation,
        before,
        after: this.snapshotMotion(dynamicEntity),
        counterpart: this.describeEntityRef(staticEntity),
      },
    );
  }

  /**
   * Removes the portion of velocity that would keep pushing into a surface.
   * @param entity Body whose velocity should be projected away from the surface normal.
   * @param normal Axis-aligned unit vector pointing from the entity toward the obstacle.
   */
  private removeInwardVelocity(entity: Entity, normal: AxisNormal): void {
    const inwardSpeed = entity.vx * normal.x + entity.vy * normal.y;
    if (inwardSpeed <= 0) {
      return;
    }
    entity.vx -= normal.x * inwardSpeed;
    entity.vy -= normal.y * inwardSpeed;
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
    return getResolvedRectSetSeparation(
      leftEntity.getWorldHitboxes(),
      rightEntity.getWorldHitboxes(),
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

  /**
   * Despawns projectiles that collide with buildings before hitting an attackable target.
   * This keeps bullets from damaging buildings while still blocking their path.
   * @param world Authoritative world being simulated.
   */
  private resolveProjectileBuildingCollisions(world: World): void {
    const projectiles = world.entities
      .all()
      .filter((entity): entity is Projectile => entity instanceof Projectile);

    for (const projectile of projectiles) {
      if (!projectile.alive) {
        continue;
      }

      const deltaX = projectile.x - projectile.previousX;
      const deltaY = projectile.y - projectile.previousY;
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
      const candidates = world.spatial.queryBox(minX, minY, maxX, maxY);
      const movingHitboxes = resolveHitboxRects(
        projectile.previousX,
        projectile.previousY,
        projectile.hitboxes,
      );

      let nearestAttackableHitTime: number | null = null;
      let nearestBuildingHitTime: number | null = null;

      for (const candidate of candidates) {
        if (candidate.id === projectile.id || !candidate.alive) {
          continue;
        }

        const targetHitboxes = candidate.getWorldHitboxes();
        const hitTime = getSweptResolvedRectSetIntersectionTime(
          movingHitboxes,
          deltaX,
          deltaY,
          targetHitboxes,
        );
        if (hitTime === null) {
          continue;
        }

        if (candidate instanceof Building) {
          if (
            nearestBuildingHitTime === null ||
            hitTime < nearestBuildingHitTime
          ) {
            nearestBuildingHitTime = hitTime;
          }
          continue;
        }

        if (!canAttackTarget(world, projectile, candidate)) {
          continue;
        }

        if (
          nearestAttackableHitTime === null ||
          hitTime < nearestAttackableHitTime
        ) {
          nearestAttackableHitTime = hitTime;
        }
      }

      if (
        nearestBuildingHitTime !== null &&
        (nearestAttackableHitTime === null ||
          nearestBuildingHitTime <= nearestAttackableHitTime)
      ) {
        projectile.alive = false;
        world.despawn(projectile.id);
      }
    }
  }
}

export default CollisionSystem
