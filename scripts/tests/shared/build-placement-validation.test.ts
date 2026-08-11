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

const wallProfile = [makeHitboxRect(32, 32)];

function validateAt(
  targetX: number,
  targetY: number,
  overrides: Partial<Parameters<typeof validateBuildPlacement>[0]> = {},
) {
  const snapped = snapBuildPlacementTarget(targetX, targetY);
  return validateBuildPlacement({
    playerX: 100,
    playerY: 100,
    targetX,
    targetY,
    maxDistance: BUILD_PLACEMENT_MAX_DISTANCE,
    worldWidth: 12800,
    worldHeight: 12800,
    placementHitboxes: resolveHitboxRects(snapped.x, snapped.y, wallProfile),
    placementBounds: offsetHitboxBounds(
      getHitboxBounds(wallProfile),
      snapped.x,
      snapped.y,
    ),
    blockerHitboxes: [],
    ...overrides,
  });
}

describe("build placement validation", () => {
  test("accepts in-range placement with no blockers", () => {
    expect(validateAt(120.4, 80.6)).toEqual({
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

  for (const [label, x, reason] of [
    ["out-of-range placement", 900, "out_of_range"],
    ["placement outside world bounds", -5, "out_of_bounds"],
  ] as const) {
    test(`rejects ${label}`, () => {
      const result = validateAt(x, 100);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(reason);
    });
  }

  test("rejects overlap with player and static blockers", () => {
    const playerHitboxes = resolveHitboxRects(100, 100, [
      makeHitboxRect(24, 24),
    ]);
    const blockerHitboxes = [
      resolveHitboxRects(130, 100, [makeHitboxRect(32, 32)]),
    ];

    const playerOverlap = validateAt(100, 100, {
      playerHitboxes,
    });
    expect(playerOverlap.ok).toBe(false);
    if (!playerOverlap.ok) {
      expect(playerOverlap.reason).toBe("overlaps_player");
    }

    const blockerOverlap = validateAt(100, 100, {
      playerX: 50,
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
