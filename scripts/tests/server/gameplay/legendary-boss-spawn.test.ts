import { beforeAll, describe, expect, test } from "bun:test";
import { Enemy } from "@server/entities/Enemy.ts";
import { Thanos } from "@server/entities/enemies/Thanos.ts";
import { Wither } from "@server/entities/enemies/Wither.ts";
import { trySpawnWaveSevenExtractionThanos } from "@server/systems/MapLoader.ts";
import { getExtractionLegendaryBossUnlockNightCycle } from "@shared/config/gameplayConfig.ts";
import {
  DUNGEON_LEGENDARY_BOSS_TYPE_ID,
  EXTRACTION_LEGENDARY_BOSS_TYPE_ID,
  isLegendaryBossTypeId,
} from "@shared/world/legendaryBoss.ts";
import { getSectorForPoint } from "@shared/world/layoutTypes.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
  tick,
} from "@tests/helpers/worldFixtures.ts";

function livingThanos(runtime: ReturnType<typeof makeRuntime>["runtime"]) {
  return runtime.world.entities
    .all()
    .filter(
      (entity): entity is Thanos => entity instanceof Thanos && entity.alive,
    );
}

function livingLegendaryBosses(
  runtime: ReturnType<typeof makeRuntime>["runtime"],
) {
  return runtime.world.entities
    .all()
    .filter(
      (entity): entity is Enemy =>
        entity instanceof Enemy &&
        entity.alive &&
        isLegendaryBossTypeId(entity.typeId),
    );
}

describe("legendary boss spawn", () => {
  beforeAll(bootstrapTestRegistries);

  test("match init spawns Wither in dungeon and Thanos at extraction with no other legendary bosses", () => {
    const { runtime } = makeRuntime({ worldSeed: 1337 });
    const layout = runtime.world.proceduralLayout;
    expect(layout).not.toBeNull();
    if (!layout) {
      throw new Error("expected procedural layout");
    }

    expect(runtime.world.waveSevenExtractionThanosSpawned).toBe(false);

    const living = livingLegendaryBosses(runtime);
    expect(living).toHaveLength(2);

    const wither = living.find(
      (enemy) => enemy.typeId === DUNGEON_LEGENDARY_BOSS_TYPE_ID,
    );
    const initThanos = living.find(
      (enemy) =>
        enemy.typeId === EXTRACTION_LEGENDARY_BOSS_TYPE_ID &&
        enemy.spawnSource === "layout",
    );
    expect(wither).toBeInstanceOf(Wither);
    expect(getSectorForPoint(layout, wither!)?.archetype).toBe("dungeon");
    expect(initThanos).toBeInstanceOf(Thanos);
    expect(initThanos?.x).toBe(layout.extraction.x);
    expect(initThanos?.y).toBe(layout.extraction.y);
    expect(getSectorForPoint(layout, initThanos!)?.archetype).toBe(
      "extraction",
    );
    expect(livingThanos(runtime)).toHaveLength(1);
  });

  test("wave seven spawns a second extraction Thanos without removing the layout boss", () => {
    expect(getExtractionLegendaryBossUnlockNightCycle()).toBe(7);

    const { runtime } = makeRuntime({ worldSeed: 1337 });
    const layout = runtime.world.proceduralLayout;
    expect(layout).not.toBeNull();
    if (!layout) {
      throw new Error("expected procedural layout");
    }

    trySpawnWaveSevenExtractionThanos(runtime.world, 6);
    expect(livingThanos(runtime)).toHaveLength(1);
    expect(runtime.world.waveSevenExtractionThanosSpawned).toBe(false);

    trySpawnWaveSevenExtractionThanos(runtime.world, 7);
    const thanos = livingThanos(runtime);
    expect(thanos).toHaveLength(2);
    expect(runtime.world.waveSevenExtractionThanosSpawned).toBe(true);

    const layoutBoss = thanos.find((enemy) => enemy.spawnSource === "layout");
    const waveBoss = thanos.find((enemy) => enemy.spawnSource === "wave");
    expect(layoutBoss).toBeDefined();
    expect(waveBoss).toBeDefined();
    expect(waveBoss?.x).toBe(layout.extraction.x);
    expect(waveBoss?.y).toBe(layout.extraction.y);

    trySpawnWaveSevenExtractionThanos(runtime.world, 7);
    expect(livingThanos(runtime)).toHaveLength(2);
  });

  test("wave system spawns the second extraction Thanos when the seventh night begins", () => {
    const { runtime } = makeRuntime({
      worldSeed: 1337,
      config: { dayNight: { dayDurationTicks: 1, nightDurationTicks: 1200 } },
    });
    const waveSystem = runtime.world.waveSystem;
    expect(waveSystem).toBeDefined();
    if (!waveSystem) {
      throw new Error("expected wave system");
    }

    expect(livingThanos(runtime)).toHaveLength(1);

    Object.assign(waveSystem, { nightCycleCounter: 6, lastIsNight: false });
    runtime.world.dayNightSystem.setPhase("night");
    tick(runtime, 1);

    const thanos = livingThanos(runtime);
    expect(thanos).toHaveLength(2);
    expect(waveSystem.getNightCycleCounter()).toBe(7);
    expect(runtime.world.waveSevenExtractionThanosSpawned).toBe(true);
    expect(thanos.some((enemy) => enemy.spawnSource === "wave")).toBe(true);
  });
});
