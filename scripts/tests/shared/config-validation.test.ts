import { describe, expect, test } from "bun:test";
import {
  dayNightConfig,
  enemyTuningConfig,
  extractionConfig,
  GAMEPLAY_CONFIG_COMPAT_DESCRIPTOR,
  interactionsConfig,
  pickupsConfig,
  recyclingConfig,
  runtimeConfig,
  wavesConfig,
  worldgenConfig,
} from "@shared/config/gameplayConfig.ts";
import { COMPAT_MANIFEST } from "@shared/config/compat.ts";

describe("shared gameplay config", () => {
  test("runtime config exposes positive authoritative dimensions and cadence", () => {
    expect(runtimeConfig.tickRate).toBeGreaterThan(0);
    expect(runtimeConfig.worldSize.w).toBeGreaterThan(0);
    expect(runtimeConfig.worldSize.h).toBeGreaterThan(0);
    expect(runtimeConfig.collision.spatialCellSize).toBeGreaterThan(0);
    expect(runtimeConfig.replication.interestRadius).toBeGreaterThan(0);
  });

  test("interaction limits keep derived slot indexes and ranges valid", () => {
    expect(interactionsConfig.hotbarSlotCount).toBeGreaterThan(0);
    expect(interactionsConfig.chestSlotCount).toBeGreaterThan(
      interactionsConfig.hotbarSlotCount,
    );
    expect(
      interactionsConfig.craftingStationQueryRadius,
    ).toBeGreaterThanOrEqual(interactionsConfig.craftingStationInteractPadding);
    expect(interactionsConfig.buildPlacementMaxDistance).toBeGreaterThanOrEqual(
      interactionsConfig.chestInteractRadius,
    );
  });

  test("pickup cadence and active caps are valid for every spawn pool", () => {
    for (const pool of [
      pickupsConfig.mag,
      pickupsConfig.weapon,
      pickupsConfig.blueprint,
      pickupsConfig.food,
    ]) {
      expect(pool.intervalMs).toBeGreaterThan(0);
      expect(pool.maxActive).toBeGreaterThanOrEqual(0);
    }
    expect(pickupsConfig.spawnAttempts).toBeGreaterThan(0);
  });

  test("rarity recycling ranges are ordered by tier and internally valid", () => {
    const ranges = [
      recyclingConfig.rarityHunkRanges.common,
      recyclingConfig.rarityHunkRanges.uncommon,
      recyclingConfig.rarityHunkRanges.rare,
      recyclingConfig.rarityHunkRanges.epic,
      recyclingConfig.rarityHunkRanges.legendary,
    ];
    for (const [min, max] of ranges) {
      expect(max).toBeGreaterThanOrEqual(min);
    }
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]![0]).toBeGreaterThan(ranges[index - 1]![1]);
    }
  });

  test("enemy global tuning keeps enemy weapons slower and shorter ranged", () => {
    expect(enemyTuningConfig.weaponAttackSpeedMultiplier).toBeGreaterThan(0);
    expect(enemyTuningConfig.weaponAttackSpeedMultiplier).toBeLessThan(1);
    expect(enemyTuningConfig.weaponAttackRangeMultiplier).toBeGreaterThan(0);
    expect(enemyTuningConfig.weaponAttackRangeMultiplier).toBeLessThan(1);
  });

  test("extraction and day-night timers define reachable progression", () => {
    expect(extractionConfig.finalWaveCycle).toBeLessThanOrEqual(
      wavesConfig.proceduralAfterNightCycle,
    );
    expect(extractionConfig.chopperTimerGoalMs).toBeLessThan(
      extractionConfig.boardTimerGoalMs,
    );
    expect(dayNightConfig.nightDurationMs).toBeLessThan(
      dayNightConfig.dayDurationMs,
    );
  });

  test("world generation config keeps the sector grid and world size aligned", () => {
    expect(worldgenConfig.sectorBands).toHaveLength(worldgenConfig.gridSize);
    const worldWidth = worldgenConfig.sectorBands.reduce(
      (sum, band) => sum + band,
      0,
    );
    expect(runtimeConfig.worldSize.w).toBe(worldWidth);
    expect(runtimeConfig.worldSize.h).toBe(worldWidth);
  });

  test("gameplay config participates in compatibility metadata", () => {
    expect(COMPAT_MANIFEST.config).toEqual(GAMEPLAY_CONFIG_COMPAT_DESCRIPTOR);
    expect(COMPAT_MANIFEST.config).toMatchObject({
      runtime: runtimeConfig,
      interactions: interactionsConfig,
      waves: wavesConfig,
    });
  });
});
