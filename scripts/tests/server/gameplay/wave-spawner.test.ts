import { beforeAll, describe, expect, test } from "bun:test";
import { Enemy } from "@server/entities/Enemy.ts";
import { Thanos } from "@server/entities/enemies/Thanos.ts";
import { WaveSpawner } from "@server/systems/WaveSpawner.ts";
import {
  getExtractionLegendaryBossUnlockNightCycle,
  wavesConfig,
} from "@shared/config/gameplayConfig.ts";
import { isLegendaryBossTypeId } from "@shared/world/legendaryBoss.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
} from "@tests/helpers/worldFixtures.ts";

function pendingEntityTypes(
  spawner: WaveSpawner,
  nightCycle: number,
): string[] {
  spawner.onNightStart(nightCycle);
  return spawner.getPendingSpawnDetails().map((detail) => detail.entityType);
}

describe("wave spawner", () => {
  beforeAll(bootstrapTestRegistries);

  test("never schedules legendary bosses in random waves", () => {
    const spawner = WaveSpawner.fromSharedConfig(null);
    for (let nightCycle = 1; nightCycle <= 10; nightCycle += 1) {
      const entityTypes = pendingEntityTypes(spawner, nightCycle);
      expect(entityTypes).not.toContain("thanos");
    }
  });

  test("extraction legendary boss unlocks on the final tier floor night", () => {
    expect(getExtractionLegendaryBossUnlockNightCycle()).toBe(7);
    expect(isLegendaryBossTypeId("enemy:thanos")).toBe(true);
    expect(Thanos.resourceName).toBe("thanos");
  });

  test("spawns wave enemies within the configured center radius", () => {
    const { runtime } = makeRuntime();
    const spawner = WaveSpawner.fromSharedConfig(null);
    spawner.onNightStart(1);

    while (spawner.getPendingSpawnCount() > 0) {
      spawner.update(runtime.world, true);
    }

    const centerX = runtime.world.gameConfig.worldSize.w / 2;
    const centerY = runtime.world.gameConfig.worldSize.h / 2;
    const waveEnemies = runtime.world.entities
      .all()
      .filter(
        (entity): entity is Enemy =>
          entity instanceof Enemy && entity.spawnSource === "wave",
      );
    expect(waveEnemies.length).toBeGreaterThan(0);

    const maxRadius = wavesConfig.waveSpawn.maxRadius + 30;
    for (const enemy of waveEnemies) {
      const distance = Math.hypot(enemy.x - centerX, enemy.y - centerY);
      expect(distance).toBeGreaterThanOrEqual(
        wavesConfig.waveSpawn.minRadius - 30,
      );
      expect(distance).toBeLessThanOrEqual(maxRadius);
    }
  });
});
