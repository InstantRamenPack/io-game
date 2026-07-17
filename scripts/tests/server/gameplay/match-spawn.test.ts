import { beforeAll, describe, expect, test } from "bun:test";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
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
    expect(runtime.world.kind).toBe("gameplay");
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

  test("match clients do not spawn inside starter tower blockers", () => {
    const { runtime } = makeRuntime();
    const players = Array.from({ length: 5 }, (_value, index) =>
      connectTestClient(runtime, `client-${index + 1}`, `player-${index + 1}`),
    );

    for (const { player } of players) {
      const playerHitboxes = player.getWorldHitboxes();
      const overlappingBlockers = runtime.world.entities
        .all()
        .filter(
          (entity) =>
            entity.id !== player.id &&
            entity.collisionMode !== "none" &&
            doResolvedRectSetsOverlap(
              playerHitboxes,
              entity.getWorldHitboxes(),
            ),
        );
      expect(overlappingBlockers).toHaveLength(0);
    }
  });

  test("match clients start with an empty hotbar", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1", "match-loadout");

    expect(player.inventory.hotbarSlots.every((slot) => slot === null)).toBe(
      true,
    );
    expect(player.inventory.selectedHotbarIndex).toBe(0);
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

    expect(runtime.world.kind).toBe("lobby");
    expect({ x: player.x, y: player.y }).toEqual(
      getPlayerSpawnPosition(runtime.world.gameConfig.worldSize),
    );
    expect(player.inventory.hotbarSlots.some((slot) => slot !== null)).toBe(
      true,
    );
  });
});
