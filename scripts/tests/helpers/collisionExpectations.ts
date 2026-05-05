import { expect } from "bun:test";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { StaticGeometryBlocker } from "@server/world/StaticGeometryIndex.ts";
import type { World } from "@server/world/World.ts";
import {
  assertAllEntityPositionsFinite,
  assertNoDynamicEntityOutsideWorld,
  assertNoDynamicStaticOverlap,
  findDynamicOverlapPairs,
} from "@tests/helpers/collisionInvariants.ts";

export function expectAllEntityPositionsFinite(world: World): void {
  expect(() => assertAllEntityPositionsFinite(world)).not.toThrow();
}

export function expectNoDynamicEntityOutsideWorld(world: World): void {
  expect(() => assertNoDynamicEntityOutsideWorld(world)).not.toThrow();
}

export function expectNoDynamicStaticOverlap(world: World): void {
  expect(() => assertNoDynamicStaticOverlap(world)).not.toThrow();
}

export function expectDynamicOverlapState(
  world: World,
  expected: boolean = false,
): void {
  const overlaps = findDynamicOverlapPairs(world);
  expect(overlaps.length > 0).toBe(expected);
}

export function expectEntityDoesNotOverlapBlocker(
  entity: Entity,
  blocker: StaticGeometryBlocker,
): void {
  expect(
    doResolvedRectSetsOverlap(entity.getWorldHitboxes(), blocker.hitboxes),
    `entity ${entity.id} overlaps blocker ${blocker.entityId}`,
  ).toBe(false);
}

export function expectEntityMovedNoMoreThan(
  entityBefore: Entity,
  entityAfter: Entity,
  maxDistance: number,
): void {
  const distance = Math.hypot(
    entityAfter.x - entityBefore.x,
    entityAfter.y - entityBefore.y,
  );
  expect(distance).toBeLessThanOrEqual(maxDistance);
}
