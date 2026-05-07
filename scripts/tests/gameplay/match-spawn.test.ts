import { beforeAll, describe, expect, test } from "bun:test";
import { getPlayerSpawnPosition } from "@server/entities/playerSpawn.ts";
import { GameInstanceRuntime } from "@server/server/matchmaking/GameInstanceRuntime.ts";
import { FakeNetworkServer } from "@tests/helpers/fakeNetwork.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  makeTestConfig,
} from "@tests/helpers/worldFixtures.ts";

describe("match spawn placement", () => {
  beforeAll(bootstrapTestRegistries);

  test("match clients spawn in distinct positions inside the home base", () => {
    const { runtime } = makeRuntime();
    const positions = Array.from({ length: 5 }, (_value, index) => {
      const { player } = connectTestClient(
        runtime,
        `client-${index + 1}`,
        `player-${index + 1}`,
      );
      return { x: player.x, y: player.y };
    });

    expect(new Set(positions.map(({ x, y }) => `${x},${y}`)).size).toBe(
      positions.length,
    );

    const homeBounds = runtime.world.proceduralLayout?.homeBounds;
    expect(homeBounds).toBeDefined();
    if (!homeBounds) {
      throw new Error("expected procedural home bounds");
    }

    for (const position of positions) {
      expect(position.x).toBeGreaterThanOrEqual(homeBounds.minX);
      expect(position.x).toBeLessThanOrEqual(homeBounds.maxX);
      expect(position.y).toBeGreaterThanOrEqual(homeBounds.minY);
      expect(position.y).toBeLessThanOrEqual(homeBounds.maxY);
    }
  });

  test("match respawns return players to their assigned base slot", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1", "respawn-test");
    const initialPosition = { x: player.x, y: player.y };

    player.x += 900;
    player.y += 900;
    player.handleDeath(runtime.world);
    runtime.handleRespawn("client-1");

    expect(player.alive).toBe(true);
    expect({ x: player.x, y: player.y }).toEqual(initialPosition);
  });

  test("playground spawn stays on the default shared spawn point", () => {
    const config = makeTestConfig();
    const runtime = new GameInstanceRuntime(config, new FakeNetworkServer(), {
      isPlayground: true,
    });
    const { player } = connectTestClient(runtime, "client-1", "playground");

    expect({ x: player.x, y: player.y }).toEqual(
      getPlayerSpawnPosition(runtime.world.gameConfig.worldSize),
    );
  });
});
