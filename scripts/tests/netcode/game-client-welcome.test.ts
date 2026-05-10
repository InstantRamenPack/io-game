import { describe, expect, test } from "bun:test";
import { GameClient } from "@client/client/GameClient.ts";
import { makePlayerSnapshot } from "@tests/helpers/snapshotFixtures.ts";

type GameClientHarness = Pick<GameClient, "onWelcome"> & {
  playerEntityId?: number;
  [key: string]: unknown;
};

function resolveWelcomeFromSnapshot(client: GameClientHarness): void {
  (client["resolveWelcomeFromSnapshot"] as () => void)();
}

function makeClientHarness(): {
  client: GameClientHarness;
  getReadyCount: () => number;
  getResetCount: () => number;
} {
  let sessionReady = false;
  let readyCount = 0;
  let resetCount = 0;
  const client = Object.create(GameClient.prototype) as GameClientHarness;
  client.playerEntityId = undefined;
  client["currentWorldId"] = undefined;
  client["pendingPlayerName"] = "Ray";
  client["lobbyState"] = undefined;
  client["sessionLifecycle"] = {
    isSessionReady: () => sessionReady,
    markSessionReady: () => {
      sessionReady = true;
    },
  };
  client["sessionReadyHandlers"] = [
    () => {
      readyCount += 1;
    },
  ];
  client["presentationSink"] = {
    setPlayerEntityId: () => {},
  };
  client["renderer"] = {
    setPlaygroundMode: () => {},
  };
  client["worldState"] = {
    clientWorld: {
      entities: new Map([
        [7, makePlayerSnapshot(7, 100, 100, { name: "Ray" })],
      ]),
    },
  };
  client["resetForInstanceMigration"] = () => {
    resetCount += 1;
  };
  return {
    client,
    getReadyCount: () => readyCount,
    getResetCount: () => resetCount,
  };
}

describe("game client welcome resolution", () => {
  test("late authoritative worldId binds to a snapshot-derived welcome without migration reset", () => {
    const { client, getReadyCount, getResetCount } = makeClientHarness();

    resolveWelcomeFromSnapshot(client);
    expect(client.playerEntityId).toBe(7);
    expect(client["currentWorldId"]).toBeUndefined();
    expect(getReadyCount()).toBe(1);

    client.onWelcome(7, "world-1");
    expect(client.playerEntityId).toBe(7);
    expect(client["currentWorldId"]).toBe("world-1");
    expect(getResetCount()).toBe(0);
    expect(getReadyCount()).toBe(1);
  });

  test("late authoritative welcome for another player still performs instance migration", () => {
    const { client, getReadyCount, getResetCount } = makeClientHarness();

    resolveWelcomeFromSnapshot(client);
    client.onWelcome(8, "world-2");

    expect(client.playerEntityId).toBe(8);
    expect(client["currentWorldId"]).toBe("world-2");
    expect(getResetCount()).toBe(1);
    expect(getReadyCount()).toBe(2);
  });

  test("world-id-less duplicate welcome cannot erase the current world identity", () => {
    const { client, getReadyCount, getResetCount } = makeClientHarness();

    client.onWelcome(7, "world-1");
    client.onWelcome(7);

    expect(client.playerEntityId).toBe(7);
    expect(client["currentWorldId"]).toBe("world-1");
    expect(getResetCount()).toBe(0);
    expect(getReadyCount()).toBe(1);
  });
});
