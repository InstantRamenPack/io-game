import { beforeAll, describe, expect, test } from "bun:test";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Ranger } from "@server/entities/enemies/Ranger.ts";
import { Thanos } from "@server/entities/enemies/Thanos.ts";
import type { Enemy } from "@server/entities/Enemy.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { getEnemyDeathMagDropCount } from "@server/content/serverContentCapabilities.ts";
import deathLootConfig from "@shared/content/death_loot.json";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type seedrandom from "seedrandom";
import {
  bootstrapTestRegistries,
  makeRuntime,
} from "@tests/helpers/worldFixtures.ts";
import { makeTestRng } from "@tests/helpers/testRng.ts";

const MONTE_CARLO_TRIALS = 10_000;
const MONTE_CARLO_SIGMA = 3;

function installQueuedRng(
  runtime: ReturnType<typeof makeRuntime>["runtime"],
  values: number[],
): void {
  runtime.world.randomNumberGenerator = Object.assign(
    (() => values.shift() ?? 0) as seedrandom.PRNG,
    {
      double: () => values.shift() ?? 0,
      int32: () => 0,
      quick: () => values.shift() ?? 0,
    },
  );
}

function findPickupAt(
  runtime: ReturnType<typeof makeRuntime>["runtime"],
  x: number,
  y: number,
): ItemEntity {
  const pickup = runtime.world.entities
    .all()
    .find(
      (entity): entity is ItemEntity =>
        entity instanceof ItemEntity && entity.x === x && entity.y === y,
    );
  if (!pickup) {
    throw new Error("expected dropped pickup");
  }
  return pickup;
}

function pickupDroppedMag(pickup: ItemEntity): boolean {
  for (const [typeId, amount] of pickup.contents.resources) {
    if (typeId.startsWith("mag:") && amount > 0) {
      return true;
    }
  }
  return false;
}

function totalMagCount(
  pickup: ItemEntity,
  magTypeIds: readonly ResourceId[],
): number {
  return magTypeIds.reduce(
    (total, typeId) => total + pickup.contents.countType(typeId),
    0,
  );
}

const MAG_TYPE_IDS = [
  "mag:basic_gun",
  "mag:carbine",
  "mag:crossbow",
  "mag:basic_rifle",
  "mag:sniper",
] as const satisfies readonly ResourceId[];

function binomialMargin(
  probability: number,
  trials: number,
  sigma = MONTE_CARLO_SIGMA,
): number {
  if (probability <= 0 || probability >= 1) {
    return 0;
  }
  return sigma * Math.sqrt((probability * (1 - probability)) / trials);
}

function estimateMagDropRate(
  createEnemy: (id: number) => Enemy,
  trials: number,
  seedPrefix: string,
): number {
  const { runtime } = makeRuntime();
  let drops = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    runtime.world.randomNumberGenerator = makeTestRng(`${seedPrefix}-${trial}`);

    const enemy = createEnemy(runtime.world.allocEntityId());
    enemy.x = 100 + (trial % 500);
    enemy.y = 200 + Math.floor(trial / 500);
    runtime.world.spawn(enemy);
    enemy.applyDamage(runtime.world, enemy.maxHp * 4, 0);

    const pickup = findPickupAt(runtime, enemy.x, enemy.y);
    if (pickupDroppedMag(pickup)) {
      drops += 1;
    }
    runtime.world.despawn(pickup.id);
  }

  return drops / trials;
}

describe("enemy death mag loot", () => {
  beforeAll(bootstrapTestRegistries);

  test("getEnemyDeathMagDropCount respects tier mag drop chance and count bounds", () => {
    expect(getEnemyDeathMagDropCount("common", () => 0.99)).toBe(0);
    expect(getEnemyDeathMagDropCount("common", () => 0)).toBe(
      deathLootConfig.common.magMin,
    );
    expect(
      getEnemyDeathMagDropCount("legendary", () => 0),
    ).toBeGreaterThanOrEqual(deathLootConfig.legendary.magMin);
    expect(getEnemyDeathMagDropCount("legendary", () => 0)).toBeLessThanOrEqual(
      deathLootConfig.legendary.magMax,
    );
  });

  test("ranged enemies can drop a matching mag on death", () => {
    const { runtime } = makeRuntime();
    installQueuedRng(runtime, [
      0.5, // spawn armor roll (no armor)
      0.5, // hunk amount
      0, // pick ranged weapon for mag drop
      0, // mag drop chance success
      0, // mag count roll
      1, // skip weapon drop
    ]);

    const shoota = new Shoota(runtime.world.allocEntityId());
    shoota.x = 100;
    shoota.y = 100;
    runtime.world.spawn(shoota);
    shoota.applyDamage(runtime.world, shoota.maxHp * 4, 0);

    const pickup = findPickupAt(runtime, shoota.x, shoota.y);
    expect(pickup.contents.countType("mag:basic_gun" as ResourceId)).toBe(
      deathLootConfig.common.magMin,
    );
  });

  test("melee enemies never drop magazines", () => {
    const { runtime } = makeRuntime();
    installQueuedRng(runtime, [
      0.5, // spawn armor roll (no armor)
      0.5, // hunk amount
      0, // mag drop chance success (ignored for melee)
      0, // mag count roll (ignored for melee)
      1, // skip weapon drop
    ]);

    const drifter = new Drifter(runtime.world.allocEntityId());
    drifter.x = 200;
    drifter.y = 200;
    runtime.world.spawn(drifter);
    drifter.applyDamage(runtime.world, drifter.maxHp * 4, 0);

    const pickup = findPickupAt(runtime, drifter.x, drifter.y);
    expect(totalMagCount(pickup, MAG_TYPE_IDS)).toBe(0);
  });

  test("failed mag drop chance yields hunk loot without magazines", () => {
    const { runtime } = makeRuntime();
    installQueuedRng(runtime, [
      0.5, // spawn armor roll (no armor)
      0.5, // hunk amount
      0, // pick ranged weapon for mag drop
      0.99, // mag drop chance failure
      1, // skip weapon drop
    ]);

    const shoota = new Shoota(runtime.world.allocEntityId());
    shoota.x = 300;
    shoota.y = 300;
    runtime.world.spawn(shoota);
    shoota.applyDamage(runtime.world, shoota.maxHp * 4, 0);

    const pickup = findPickupAt(runtime, shoota.x, shoota.y);
    expect(
      pickup.contents.countType("item:hunk" as ResourceId),
    ).toBeGreaterThan(0);
    expect(totalMagCount(pickup, MAG_TYPE_IDS)).toBe(0);
  });

  test("monte carlo mag drop rate matches configured tier chances", () => {
    const scenarios = [
      {
        tier: "common" as const,
        seedPrefix: "mag-mc-shoota",
        expected: deathLootConfig.common.magDropChance,
        createEnemy: (id: number) => new Shoota(id),
      },
      {
        tier: "uncommon" as const,
        seedPrefix: "mag-mc-ranger",
        expected: deathLootConfig.uncommon.magDropChance,
        createEnemy: (id: number) => new Ranger(id),
      },
      {
        tier: "legendary" as const,
        seedPrefix: "mag-mc-thanos",
        expected: deathLootConfig.legendary.magDropChance,
        createEnemy: (id: number) => new Thanos(id),
      },
    ] as const;

    for (const scenario of scenarios) {
      const observed = estimateMagDropRate(
        scenario.createEnemy,
        MONTE_CARLO_TRIALS,
        scenario.seedPrefix,
      );
      const margin = binomialMargin(scenario.expected, MONTE_CARLO_TRIALS);
      expect(observed).toBeGreaterThanOrEqual(scenario.expected - margin);
      expect(observed).toBeLessThanOrEqual(scenario.expected + margin);
    }
  });

  test("monte carlo getEnemyDeathMagDropCount drop rate matches configured chances", () => {
    const tiers = ["common", "uncommon", "rare", "epic"] as const;

    for (const tier of tiers) {
      const expected = deathLootConfig[tier].magDropChance;
      let drops = 0;

      for (let trial = 0; trial < MONTE_CARLO_TRIALS; trial += 1) {
        const rng = makeTestRng(`mag-drop-count-${tier}-${trial}`);
        if (getEnemyDeathMagDropCount(tier, rng) > 0) {
          drops += 1;
        }
      }

      const observed = drops / MONTE_CARLO_TRIALS;
      const margin = binomialMargin(expected, MONTE_CARLO_TRIALS);
      expect(observed).toBeGreaterThanOrEqual(expected - margin);
      expect(observed).toBeLessThanOrEqual(expected + margin);
    }
  });
});
