import { describe, expect, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { Player } from "@server/entities/Player.ts";
import { SnapshotManager } from "@server/net/SnapshotManager.ts";
import { World } from "@server/world/World.ts";

describe("snapshot pipeline", () => {
  test("emits snapshots at configured cadence", () => {
    const gameConfig = GameConfig.load();

    const world = new World(gameConfig);
    const playerEntity = new Player(1);
    world.spawn(playerEntity);

    const snapshotManager = new SnapshotManager(
      gameConfig.snapshotRate,
      gameConfig.tickRate,
    );

    const ticksToSimulate = gameConfig.tickRate;
    const deltaMsPerTick = 1000 / gameConfig.tickRate;
    const snapshotEveryTicks = Math.max(
      1,
      Math.floor(gameConfig.tickRate / Math.max(1, gameConfig.snapshotRate)),
    );
    let expectedSnapshotCount = 0;
    for (let tick = 1; tick <= ticksToSimulate; tick += 1) {
      if (tick % snapshotEveryTicks === 0) {
        expectedSnapshotCount += 1;
      }
    }

    let sentSnapshotCount = 0;
    for (let tickIndex = 0; tickIndex < ticksToSimulate; tickIndex += 1) {
      world.step(deltaMsPerTick);
      if (snapshotManager.shouldSendSnapshot(world.tick)) {
        snapshotManager.makeSnapshot(world);
        sentSnapshotCount += 1;
      }
    }

    expect(sentSnapshotCount).toBe(expectedSnapshotCount);
  });
});
