import type { Entity } from "@server/entities/Entity.ts";
import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";

type AxisNormal = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

/**
 * Resolves square entity overlap and world-boundary clamping.
 * Collision is kept intentionally simple and authoritative on the server.
 */
export class CollisionSystem implements System {
  /**
   * Rebuilds the broad-phase index, resolves nearby overlaps, then clamps bodies to world bounds.
   * @param world Authoritative world being simulated.
   */
  update(world: World): void {
    const collidableEntities = world.entities
      .all()
      .filter((entity) => entity.collisionMode !== "none");

    world.spatial.rebuild(collidableEntities);

    for (const entity of collidableEntities) {
      if (entity.collisionMode !== "dynamic") {
        continue;
      }

      const candidates = world.spatial.queryBox(
        entity.x - entity.radius,
        entity.y - entity.radius,
        entity.x + entity.radius,
        entity.y + entity.radius,
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
    const minX = entity.radius;
    const maxX = Math.max(minX, world.gameConfig.worldSize.w - entity.radius);
    const minY = entity.radius;
    const maxY = Math.max(minY, world.gameConfig.worldSize.h - entity.radius);

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
   * Resolves one pair of potentially colliding square bodies.
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

    if (!this.overlaps(leftEntity, rightEntity)) {
      return;
    }

    const resolution = this.getResolutionAxis(leftEntity, rightEntity);
    if (!resolution) {
      return;
    }

    if (
      leftEntity.collisionMode === "dynamic" &&
      rightEntity.collisionMode === "dynamic"
    ) {
      this.separateDynamicDynamic(
        leftEntity,
        rightEntity,
        resolution.normal,
        resolution.penetration,
      );
      return;
    }

    if (leftEntity.collisionMode === "dynamic") {
      this.separateDynamicStatic(
        leftEntity,
        rightEntity,
        resolution.normal,
        resolution.penetration,
      );
      return;
    }

    if (rightEntity.collisionMode === "dynamic") {
      this.separateDynamicStatic(
        rightEntity,
        leftEntity,
        this.invertNormal(resolution.normal),
        resolution.penetration,
      );
    }
  }

  /**
   * Returns whether two square hitboxes overlap.
   * @param leftEntity First body.
   * @param rightEntity Second body.
   * @returns True when the bodies overlap by a positive penetration amount.
   */
  private overlaps(leftEntity: Entity, rightEntity: Entity): boolean {
    const dx = Math.abs(rightEntity.x - leftEntity.x);
    const dy = Math.abs(rightEntity.y - leftEntity.y);
    const widthSum = leftEntity.radius + rightEntity.radius;
    const heightSum = leftEntity.radius + rightEntity.radius;
    return dx < widthSum && dy < heightSum;
  }

  /**
   * Separates two dynamic bodies evenly and removes inward velocity.
   * @param leftEntity First dynamic body.
   * @param rightEntity Second dynamic body.
   * @param normal Axis-aligned unit vector from left to right.
   * @param penetration Positive overlap depth.
   */
  private separateDynamicDynamic(
    leftEntity: Entity,
    rightEntity: Entity,
    normal: AxisNormal,
    penetration: number,
  ): void {
    const correction = penetration / 2;
    leftEntity.x -= normal.x * correction;
    leftEntity.y -= normal.y * correction;
    rightEntity.x += normal.x * correction;
    rightEntity.y += normal.y * correction;

    this.removeInwardVelocity(leftEntity, normal);
    this.removeInwardVelocity(rightEntity, this.invertNormal(normal));
  }

  /**
   * Separates a dynamic body away from a static body and removes inward velocity.
   * @param dynamicEntity Dynamic body that should move.
   * @param _staticEntity Static body that should remain fixed.
   * @param normal Axis-aligned unit vector from the dynamic body toward the static body.
   * @param penetration Positive overlap depth.
   */
  private separateDynamicStatic(
    dynamicEntity: Entity,
    _staticEntity: Entity,
    normal: AxisNormal,
    penetration: number,
  ): void {
    dynamicEntity.x -= normal.x * penetration;
    dynamicEntity.y -= normal.y * penetration;
    this.removeInwardVelocity(dynamicEntity, normal);
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
   * Chooses the minimum-penetration axis for square hitbox resolution.
   * @param leftEntity First body.
   * @param rightEntity Second body.
   * @returns Axis-aligned normal and penetration, or null when the boxes do not overlap.
   */
  private getResolutionAxis(
    leftEntity: Entity,
    rightEntity: Entity,
  ): { normal: AxisNormal; penetration: number } | null {
    const dx = rightEntity.x - leftEntity.x;
    const dy = rightEntity.y - leftEntity.y;
    const overlapX = leftEntity.radius + rightEntity.radius - Math.abs(dx);
    const overlapY = leftEntity.radius + rightEntity.radius - Math.abs(dy);

    if (overlapX <= 0 || overlapY <= 0) {
      return null;
    }

    if (overlapX <= overlapY) {
      return {
        normal: { x: dx >= 0 ? 1 : -1, y: 0 },
        penetration: overlapX,
      };
    }

    return {
      normal: { x: 0, y: dy >= 0 ? 1 : -1 },
      penetration: overlapY,
    };
  }

  private invertNormal(normal: AxisNormal): AxisNormal {
    return {
      x: (normal.x * -1) as -1 | 0 | 1,
      y: (normal.y * -1) as -1 | 0 | 1,
    };
  }
}
