import { beforeAll, describe, expect, test } from "bun:test";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  tick,
} from "@tests/helpers/worldFixtures.ts";

const TEST_STORM_DAMAGE = 5;
const TEST_STORM_INTERVAL_MS = 500;

describe("night storm damage", () => {
  beforeAll(bootstrapTestRegistries);

  test("night players outside the home spawn core take periodic damage", () => {
    const { runtime } = makeRuntime({
      config: {
        dayNight: {
          dayDurationMs: 50,
          nightDurationMs: 10_000,
          stormDamage: {
            damage: TEST_STORM_DAMAGE,
            intervalMs: TEST_STORM_INTERVAL_MS,
          },
        },
      },
    });
    const { player } = connectTestClient(runtime);
    const homeSector = runtime.world.proceduralLayout?.sectors.find(
      (sector) => sector.archetype === "home",
    );
    const safeZone = homeSector?.features.find(
      (feature) => feature.role === "spawn_core",
    );
    expect(safeZone).toBeDefined();
    if (!safeZone) {
      throw new Error("expected home spawn core");
    }

    player.x = safeZone.maxX + 64;
    player.y = safeZone.center.y;

    tick(runtime, 1);
    expect(runtime.world.dayNightSystem.isNight()).toBe(true);

    const hpBeforeStorm = player.hp;
    const expectedPulseDamage =
      TEST_STORM_DAMAGE * player.getDamageReductionMultiplier();
    tick(runtime, 8);
    expect(player.hp).toBe(hpBeforeStorm);

    tick(runtime, 1);
    expect(player.hp).toBeCloseTo(hpBeforeStorm - expectedPulseDamage, 5);

    tick(runtime, 10);
    expect(player.hp).toBeCloseTo(hpBeforeStorm - expectedPulseDamage * 2, 5);
  });

  test("returning to the home spawn core clears accumulated storm exposure", () => {
    const { runtime } = makeRuntime({
      config: {
        dayNight: {
          dayDurationMs: 50,
          nightDurationMs: 10_000,
          stormDamage: {
            damage: TEST_STORM_DAMAGE,
            intervalMs: TEST_STORM_INTERVAL_MS,
          },
        },
      },
    });
    const { player } = connectTestClient(runtime);
    const homeSector = runtime.world.proceduralLayout?.sectors.find(
      (sector) => sector.archetype === "home",
    );
    const safeZone = homeSector?.features.find(
      (feature) => feature.role === "spawn_core",
    );
    expect(safeZone).toBeDefined();
    if (!safeZone) {
      throw new Error("expected home spawn core");
    }

    player.x = safeZone.maxX + 64;
    player.y = safeZone.center.y;

    tick(runtime, 1);
    expect(runtime.world.dayNightSystem.isNight()).toBe(true);

    const expectedPulseDamage =
      TEST_STORM_DAMAGE * player.getDamageReductionMultiplier();
    tick(runtime, 5);
    const hpBeforeReset = player.hp;

    player.x = safeZone.center.x;
    player.y = safeZone.center.y;
    tick(runtime, 3);
    expect(player.hp).toBe(hpBeforeReset);

    player.x = safeZone.maxX + 64;
    player.y = safeZone.center.y;
    tick(runtime, 9);
    expect(player.hp).toBe(hpBeforeReset);

    tick(runtime, 1);
    expect(player.hp).toBeCloseTo(hpBeforeReset - expectedPulseDamage, 5);
  });
});
