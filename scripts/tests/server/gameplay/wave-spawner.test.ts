import { beforeAll, describe, expect, test } from "bun:test";
import { Thanos } from "@server/entities/enemies/Thanos.ts";
import { WaveSpawner } from "@server/systems/WaveSpawner.ts";
import { getExtractionLegendaryBossUnlockNightCycle } from "@shared/config/gameplayConfig.ts";
import { isLegendaryBossTypeId } from "@shared/world/legendaryBoss.ts";
import { bootstrapTestRegistries } from "@tests/helpers/worldFixtures.ts";

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
});
