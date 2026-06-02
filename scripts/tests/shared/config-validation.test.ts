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
import { getLegendaryBossTypeIds } from "@shared/world/legendaryBoss.ts";

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
      pickupsConfig.medical,
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
      expect(ranges[index]![0]).toBeGreaterThanOrEqual(ranges[index - 1]![0]);
    }
  });

  test("enemy global tuning keeps enemy weapons slower and shorter ranged", () => {
    expect(enemyTuningConfig.meleeWeaponCooldownMultiplier).toBeGreaterThan(1);
    expect(enemyTuningConfig.rangedDamageMultiplier).toBe(0.5);
    expect(enemyTuningConfig.rangedWeaponCooldownMultiplier).toBeGreaterThan(
      enemyTuningConfig.meleeWeaponCooldownMultiplier,
    );
    expect(enemyTuningConfig.weaponAttackRangeMultiplier).toBeGreaterThan(0);
    expect(enemyTuningConfig.weaponAttackRangeMultiplier).toBeLessThan(1);
    expect(
      enemyTuningConfig.nightRangedWeaponCooldownMultiplier,
    ).toBeGreaterThan(1);
    expect(enemyTuningConfig.nightRangedWeaponCooldownMultiplier).toBeLessThan(
      enemyTuningConfig.rangedWeaponCooldownMultiplier,
    );
    expect(enemyTuningConfig.nightWeaponAttackRangeMultiplier).toBeGreaterThan(
      enemyTuningConfig.weaponAttackRangeMultiplier,
    );
    expect(enemyTuningConfig.nightWeaponAttackRangeMultiplier).toBeLessThan(1);
  });

  test("extraction and day-night timers define reachable progression", () => {
    expect("finalWaveCycle" in extractionConfig).toBe(false);
    expect(extractionConfig.boardTimerGoalMs).toBe(10_000);
    expect(dayNightConfig.nightDurationMs).toBeLessThan(
      dayNightConfig.dayDurationMs,
    );
  });

  test("wave generation is driven by weighted random JSON with tier floors", () => {
    expect(wavesConfig.waves).toHaveLength(0);
    expect(wavesConfig.randomWaves.enabled).toBe(true);
    expect(wavesConfig.randomWaves.enemyWeights.length).toBeGreaterThan(0);
    expect(wavesConfig.randomWaves.tierFloors.length).toBeGreaterThanOrEqual(7);

    const floorsByNight = new Map(
      wavesConfig.randomWaves.tierFloors.map((floor) => [
        floor.nightCycle,
        floor,
      ]),
    );
    expect(floorsByNight.get(1)).toMatchObject({
      floors: { common: 1 },
      allowedTiers: ["common"],
    });
    expect(floorsByNight.get(2)?.floors.uncommon ?? 0).toBeGreaterThanOrEqual(
      1,
    );
    expect(floorsByNight.get(3)?.floors.uncommon ?? 0).toBeGreaterThanOrEqual(
      1,
    );
    expect(floorsByNight.get(4)?.floors.rare ?? 0).toBeGreaterThanOrEqual(1);
    expect(floorsByNight.get(5)?.floors.rare ?? 0).toBeGreaterThanOrEqual(1);
    expect(floorsByNight.get(5)?.floors.uncommon ?? 0).toBeGreaterThanOrEqual(
      1,
    );
    expect(floorsByNight.get(6)?.floors.epic ?? 0).toBeGreaterThanOrEqual(1);
    expect(floorsByNight.get(7)?.floors.epic ?? 0).toBeGreaterThanOrEqual(3);
    expect(
      wavesConfig.randomWaves.enemyWeights.some(
        (weight) => weight.entityType === "thanos",
      ),
    ).toBe(false);
    expect(
      wavesConfig.randomWaves.enemyWeights.map((weight) => weight.entityType),
    ).toEqual(expect.arrayContaining(["saboteur", "wallbreaker"]));
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

  test("content defines at least one legendary-tier enemy for world generation", () => {
    expect(getLegendaryBossTypeIds().length).toBeGreaterThan(0);
    expect(getLegendaryBossTypeIds()).toContain("enemy:thanos");
  });
});
