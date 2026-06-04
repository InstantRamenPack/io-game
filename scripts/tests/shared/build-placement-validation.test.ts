import { describe, expect, test } from "bun:test";
import { BUILD_PLACEMENT_MAX_DISTANCE } from "@shared/gameplay/constants.ts";
import {
  measureBuildPlacementDistance,
  snapBuildPlacementTarget,
  validateBuildPlacement,
} from "@shared/gameplay/rules/buildPlacementValidation.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { resolveHitboxRects } from "@shared/geometry/hitbox.ts";
import {
  offsetHitboxBounds,
  getHitboxBounds,
} from "@shared/geometry/hitbox.ts";
import {
  GridIndex,
  getGridCellSpanFromBounds,
  makeGridCellKey,
  toGridCell,
} from "@shared/spatial/GridIndex.ts";

describe("build placement validation", () => {
  const wallProfile = [makeHitboxRect(32, 32)];

  test("accepts in-range placement with no blockers", () => {
    const snapped = snapBuildPlacementTarget(120.4, 80.6);
    const placementHitboxes = resolveHitboxRects(
      snapped.x,
      snapped.y,
      wallProfile,
    );
    const placementBounds = offsetHitboxBounds(
      getHitboxBounds(wallProfile),
      snapped.x,
      snapped.y,
    );

    const result = validateBuildPlacement({
      playerX: 100,
      playerY: 100,
      targetX: 120.4,
      targetY: 80.6,
      maxDistance: BUILD_PLACEMENT_MAX_DISTANCE,
      worldWidth: 12800,
      worldHeight: 12800,
      placementHitboxes,
      placementBounds,
      blockerHitboxes: [],
    });

    expect(result).toEqual({
      ok: true,
      snappedX: 120,
      snappedY: 81,
      distance: measureBuildPlacementDistance({
        playerX: 100,
        playerY: 100,
        targetX: 120.4,
        targetY: 80.6,
      }),
    });
  });

  test("rejects out-of-range placement", () => {
    const snapped = snapBuildPlacementTarget(900, 100);
    const placementHitboxes = resolveHitboxRects(
      snapped.x,
      snapped.y,
      wallProfile,
    );
    const placementBounds = offsetHitboxBounds(
      getHitboxBounds(wallProfile),
      snapped.x,
      snapped.y,
    );

    const result = validateBuildPlacement({
      playerX: 100,
      playerY: 100,
      targetX: 900,
      targetY: 100,
      maxDistance: BUILD_PLACEMENT_MAX_DISTANCE,
      worldWidth: 12800,
      worldHeight: 12800,
      placementHitboxes,
      placementBounds,
      blockerHitboxes: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("out_of_range");
    }
  });

  test("rejects placement outside world bounds", () => {
    const snapped = snapBuildPlacementTarget(-5, 100);
    const placementHitboxes = resolveHitboxRects(
      snapped.x,
      snapped.y,
      wallProfile,
    );
    const placementBounds = offsetHitboxBounds(
      getHitboxBounds(wallProfile),
      snapped.x,
      snapped.y,
    );

    const result = validateBuildPlacement({
      playerX: 100,
      playerY: 100,
      targetX: -5,
      targetY: 100,
      maxDistance: BUILD_PLACEMENT_MAX_DISTANCE,
      worldWidth: 12800,
      worldHeight: 12800,
      placementHitboxes,
      placementBounds,
      blockerHitboxes: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("out_of_bounds");
    }
  });

  test("rejects overlap with player and static blockers", () => {
    const snapped = snapBuildPlacementTarget(100, 100);
    const placementHitboxes = resolveHitboxRects(
      snapped.x,
      snapped.y,
      wallProfile,
    );
    const placementBounds = offsetHitboxBounds(
      getHitboxBounds(wallProfile),
      snapped.x,
      snapped.y,
    );
    const playerHitboxes = resolveHitboxRects(100, 100, [
      makeHitboxRect(24, 24),
    ]);
    const blockerHitboxes = [
      resolveHitboxRects(130, 100, [makeHitboxRect(32, 32)]),
    ];

    const playerOverlap = validateBuildPlacement({
      playerX: 100,
      playerY: 100,
      targetX: 100,
      targetY: 100,
      maxDistance: BUILD_PLACEMENT_MAX_DISTANCE,
      worldWidth: 12800,
      worldHeight: 12800,
      placementHitboxes,
      placementBounds,
      playerHitboxes,
      blockerHitboxes: [],
    });
    expect(playerOverlap.ok).toBe(false);
    if (!playerOverlap.ok) {
      expect(playerOverlap.reason).toBe("overlaps_player");
    }

    const blockerOverlap = validateBuildPlacement({
      playerX: 50,
      playerY: 100,
      targetX: 100,
      targetY: 100,
      maxDistance: BUILD_PLACEMENT_MAX_DISTANCE,
      worldWidth: 12800,
      worldHeight: 12800,
      placementHitboxes,
      placementBounds,
      blockerHitboxes,
    });
    expect(blockerOverlap.ok).toBe(false);
    if (!blockerOverlap.ok) {
      expect(blockerOverlap.reason).toBe("overlaps_blocker");
    }
  });
});

describe("GridIndex", () => {
  test("indexes items across overlapping cells and deduplicates query results", () => {
    const grid = new GridIndex<{ id: number; minX: number; maxX: number }>(64);
    const item = { id: 1, minX: 10, maxX: 130 };
    const span = getGridCellSpanFromBounds(item.minX, 0, item.maxX, 10, 64);
    grid.addToCells(grid.keysFromSpan(span), item);

    expect(toGridCell(10, 64)).toBe(0);
    expect(makeGridCellKey(0, 0)).toBe(makeGridCellKey(0, 0));

    const result: (typeof item)[] = [];
    grid.queryBox(0, 0, 200, 64, result, (entry) => entry.id);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(1);

    grid.queryBox(0, 0, 200, 64, result, (entry) => entry.id);
    expect(result).toHaveLength(1);
  });
});
