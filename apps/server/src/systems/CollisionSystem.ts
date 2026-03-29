import {
  type AxisSeparation,
  getResolvedRectSetSeparation,
} from "@shared/geometry/collision.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

type AxisNormal = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

/**
 * Resolves composite entity overlap and world-boundary clamping.
 * Collision is kept authoritative and axis-aligned on the server.
 */
export class CollisionSystem implements System {
  private readonly queryBuffer: Entity[] = [];

  /**
   * Resolves nearby overlaps using the prebuilt broad-phase index, then clamps bodies to world bounds.
   * @param world Authoritative world being simulated.
   */
  update(world: World): void {
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
        this.resolveEntityPair(entity, candidate);
      }
    }

    for (const entity of collidableEntities) {
      this.resolveWorldBounds(entity, world);
    }
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

    if (entity.x < minX) {
      entity.x = minX;
      if (entity.vx < 0) {
        entity.vx = 0;
      }
    } else if (entity.x > maxX) {
      entity.x = maxX;
      if (entity.vx > 0) {
        entity.vx = 0;
      }
    }

    if (entity.y < minY) {
      entity.y = minY;
      if (entity.vy < 0) {
        entity.vy = 0;
      }
    } else if (entity.y > maxY) {
      entity.y = maxY;
      if (entity.vy > 0) {
        entity.vy = 0;
      }
    }
  }

  /**
   * Resolves one pair of potentially colliding composite bodies.
   * @param leftEntity First body.
   * @param rightEntity Second body.
   */
  private resolveEntityPair(leftEntity: Entity, rightEntity: Entity): void {
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
      this.separateDynamicDynamic(leftEntity, rightEntity, separation);
      return;
    }

    if (leftEntity.collisionMode === "dynamic") {
      this.separateDynamicStatic(leftEntity, separation);
      return;
    }

    if (rightEntity.collisionMode === "dynamic") {
      this.separateDynamicStatic(
        rightEntity,
        this.invertSeparation(separation),
      );
    }
  }

  /**
   * Separates two dynamic bodies evenly and removes inward velocity.
   * @param leftEntity First dynamic body.
   * @param rightEntity Second dynamic body.
   * @param separation Translation that would resolve the pair by moving the left body alone.
   */
  private separateDynamicDynamic(
    leftEntity: Entity,
    rightEntity: Entity,
    separation: AxisSeparation,
  ): void {
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
  }

  /**
   * Separates a dynamic body away from a static body and removes inward velocity.
   * @param dynamicEntity Dynamic body that should move.
   * @param separation Translation required to resolve the overlap.
   */
  private separateDynamicStatic(
    dynamicEntity: Entity,
    separation: AxisSeparation,
  ): void {
    if (separation.axis === "x") {
      dynamicEntity.x += separation.translation;
    } else {
      dynamicEntity.y += separation.translation;
    }

    this.removeInwardVelocity(
      dynamicEntity,
      this.getNormalFromTranslation(separation),
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
}
