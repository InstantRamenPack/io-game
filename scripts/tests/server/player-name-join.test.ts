import { describe, expect, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { Player } from "@server/entities/Player.ts";
import { GameServer } from "@server/server/GameServer.ts";
import { FakeNetworkServer } from "@tests/helpers/fakeNetwork.ts";

async function sendHello(
  server: GameServer,
  gameConfig: GameConfig,
  clientId: string,
  playerName: string | undefined,
): Promise<void> {
  const handleHello = (
    server as unknown as {
      handleHello(
        clientId: string,
        helloMessage: {
          t: "hello";
          compatHash: string;
          playerName: string | undefined;
        },
      ): Promise<void>;
    }
  ).handleHello.bind(server);

  await handleHello(clientId, {
    t: "hello",
    compatHash: gameConfig.compatHash,
    playerName,
  });
}

function errorMessages(network: FakeNetworkServer, clientId: string): string[] {
  return network.sent
    .filter((message) => message.clientId === clientId)
    .map((message) => JSON.parse(String(message.data)) as { message?: string })
    .map((message) => message.message)
    .filter((message): message is string => typeof message === "string");
}

function playerCount(server: GameServer): number {
  return server.world.entities.countInstances(Player);
}

describe("player name joins", () => {
  test("rejects empty names instead of generating a fallback", async () => {
    const network = new FakeNetworkServer();
    const gameConfig = new GameConfig();
    const server = new GameServer(gameConfig, network);

    await sendHello(server, gameConfig, "client-1", "  ");

    expect(errorMessages(network, "client-1")).toContain("name_required");
    expect(playerCount(server)).toBe(0);
  });

  test("rejects duplicate names case-insensitively", async () => {
    const network = new FakeNetworkServer();
    const gameConfig = new GameConfig();
    const server = new GameServer(gameConfig, network);

    await sendHello(server, gameConfig, "client-1", "Ray");
    await sendHello(server, gameConfig, "client-2", "ray");

    expect(errorMessages(network, "client-2")).toContain("name_taken");
    expect(playerCount(server)).toBe(1);
  });
});
