import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";

export function assertAllEntityPositionsFinite(world: World): void {
  for (const entity of world.entities.all()) {
    if (
      !Number.isFinite(entity.x) ||
      !Number.isFinite(entity.y) ||
      !Number.isFinite(entity.vx) ||
      !Number.isFinite(entity.vy)
    ) {
      throw new Error(`entity ${entity.id} has non-finite position/velocity`);
    }
  }
}

export function assertNoDynamicEntityOutsideWorld(world: World): void {
  const bounds = world.gameConfig.worldSize;
  for (const entity of world.entities.all()) {
    if (entity.collisionMode !== "dynamic") {
      continue;
    }
    const entityBounds = entity.getWorldBounds();
    if (
      entityBounds.minX < 0 ||
      entityBounds.minY < 0 ||
      entityBounds.maxX > bounds.w ||
      entityBounds.maxY > bounds.h
    ) {
      throw new Error(
        `entity ${entity.id} outside world bounds (${entityBounds.minX},${entityBounds.minY})-(${entityBounds.maxX},${entityBounds.maxY})`,
      );
    }
  }
}

export function assertNoDynamicStaticOverlap(world: World): void {
  for (const entity of world.entities.all()) {
    if (entity.collisionMode !== "dynamic") {
      continue;
    }
    const bounds = entity.getWorldBounds();
    const blockers = world.staticGeometry.queryBox(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    );
    for (const blocker of blockers) {
      if (blocker.entityId === entity.id) {
        continue;
      }
      if (
        doResolvedRectSetsOverlap(entity.getWorldHitboxes(), blocker.hitboxes)
      ) {
        throw new Error(
          `dynamic entity ${entity.id} overlaps static blocker ${blocker.entityId}`,
        );
      }
    }
  }
}

export function findDynamicOverlapPairs(world: World): Array<[Entity, Entity]> {
  const dynamicEntities = world.entities
    .all()
    .filter((entity) => entity.collisionMode === "dynamic");
  const overlaps: Array<[Entity, Entity]> = [];
  for (let i = 0; i < dynamicEntities.length; i += 1) {
    for (let j = i + 1; j < dynamicEntities.length; j += 1) {
      const left = dynamicEntities[i]!;
      const right = dynamicEntities[j]!;
      if (
        doResolvedRectSetsOverlap(
          left.getWorldHitboxes(),
          right.getWorldHitboxes(),
        )
      ) {
        overlaps.push([left, right]);
      }
    }
  }
  return overlaps;
}
