import { beforeAll, describe, expect, test } from "bun:test";
import type { Player } from "@server/entities/Player.ts";
import type { GameInstanceRuntime } from "@server/server/matchmaking/GameInstanceRuntime.ts";
import { extractionConfig } from "@shared/config/gameplayConfig.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
} from "@tests/helpers/worldFixtures.ts";

function clearExtractionThreats(runtime: GameInstanceRuntime): void {
  const extraction = runtime.world.proceduralLayout?.extraction;
  if (!extraction) {
    return;
  }
  const clearRadius = extractionConfig.enemyDangerRadius * 1.5;
  for (const entity of runtime.world.entities.all()) {
    if (!entity.typeId.startsWith("enemy:") || !entity.alive) {
      continue;
    }
    const dx = entity.x - extraction.x;
    const dy = entity.y - extraction.y;
    if (Math.hypot(dx, dy) <= clearRadius) {
      entity.alive = false;
    }
  }
}

function parkPlayersOnHelipad(
  runtime: GameInstanceRuntime,
  players: readonly Player[],
): void {
  const extraction = runtime.world.proceduralLayout?.extraction;
  if (!extraction) {
    throw new Error("expected procedural extraction helipad");
  }
  for (const player of players) {
    player.x = extraction.x;
    player.y = extraction.y;
    player.alive = true;
    player.hp = player.maxHp;
  }
  clearExtractionThreats(runtime);
}

function parkPlayerOffHelipad(
  player: Player,
  extraction: { x: number; y: number },
): void {
  player.x = extraction.x + 500;
  player.y = extraction.y;
  player.alive = true;
  player.hp = player.maxHp;
}

describe("extraction helipad", () => {
  beforeAll(bootstrapTestRegistries);

  test("requires all alive players on the helipad for 10 consecutive seconds", () => {
    const { runtime } = makeRuntime({ worldSeed: 1337 });
    const extraction = runtime.world.proceduralLayout?.extraction;
    expect(extraction).toBeDefined();
    if (!extraction) {
      throw new Error("expected procedural extraction helipad");
    }

    const first = connectTestClient(runtime, "client-1", "alpha");
    const second = connectTestClient(runtime, "client-2", "bravo");
    parkPlayersOnHelipad(runtime, [first.player]);
    parkPlayerOffHelipad(second.player, extraction);

    runtime.tick();
    let snapshot = runtime.snapshotManager.makeSnapshotForPlayer(
      runtime.world,
      first.playerId,
      runtime.world.gameConfig.replication.interestRadius,
    );
    expect(snapshot.extraction.stage).toBe("active");
    expect(snapshot.extraction.boardElapsedMs).toBe(0);

    const ticksForGoal =
      Math.ceil(
        extractionConfig.boardTimerGoalMs /
          (1000 / runtime.world.gameConfig.tickRate),
      ) + 5;
    for (let tick = 0; tick < ticksForGoal; tick += 1) {
      parkPlayersOnHelipad(runtime, [first.player, second.player]);
      runtime.tick();
    }

    snapshot = runtime.snapshotManager.makeSnapshotForPlayer(
      runtime.world,
      first.playerId,
      runtime.world.gameConfig.replication.interestRadius,
    );
    expect(snapshot.extraction.stage).toBe("complete");
    expect(snapshot.extraction.boardElapsedMs).toBeGreaterThanOrEqual(
      extractionConfig.boardTimerGoalMs,
    );
    expect(runtime.world.extractionSystem?.isComplete()).toBe(true);
  });

  test("resets extraction progress when a player leaves the helipad", () => {
    const { runtime } = makeRuntime({ worldSeed: 1337 });
    const extraction = runtime.world.proceduralLayout?.extraction;
    expect(extraction).toBeDefined();
    if (!extraction) {
      throw new Error("expected procedural extraction helipad");
    }

    const first = connectTestClient(runtime, "client-1", "alpha");
    const second = connectTestClient(runtime, "client-2", "bravo");

    for (let tick = 0; tick < 40; tick += 1) {
      parkPlayersOnHelipad(runtime, [first.player, second.player]);
      runtime.tick();
    }

    parkPlayerOffHelipad(second.player, extraction);
    runtime.tick();

    const snapshot = runtime.snapshotManager.makeSnapshotForPlayer(
      runtime.world,
      first.playerId,
      runtime.world.gameConfig.replication.interestRadius,
    );
    expect(snapshot.extraction.stage).toBe("active");
    expect(snapshot.extraction.boardElapsedMs).toBe(0);
    expect(runtime.world.extractionSystem?.isComplete()).toBe(false);
  });
});
