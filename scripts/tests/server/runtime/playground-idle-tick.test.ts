import { describe, expect, test } from "bun:test";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { GameServer } from "@server/server/GameServer.ts";
import { FakeNetworkServer } from "@tests/helpers/fakeNetwork.ts";
import { WorldSnapshotSchema } from "@shared/net/snapshots.ts";
import { parseServerToClientMessage } from "@shared/net/protocol.ts";

describe("playground idle tick skipping", () => {
  test("does not simulate playground when no clients are attached", () => {
    const network = new FakeNetworkServer();
    const gameConfig = new GameConfig();
    const server = new GameServer(gameConfig, network, {
      enableMatchmaking: false,
    });

    const tickBefore = server.world.tick;
    server.tick();
    server.tick();

    expect(server.world.tick).toBe(tickBefore);
  });

  test("simulates playground again after a preview client connects", async () => {
    const network = new FakeNetworkServer();
    const gameConfig = new GameConfig();
    const server = new GameServer(gameConfig, network, {
      enableMatchmaking: false,
    });
    const handleHello = (
      server as unknown as {
        handleHello(
          clientId: string,
          helloMessage: {
            t: "hello";
            compatHash: string;
            preview?: boolean;
          },
        ): Promise<void>;
      }
    ).handleHello.bind(server);

    await handleHello("preview-client", {
      t: "hello",
      compatHash: gameConfig.compatHash,
      preview: true,
    });

    const tickBefore = server.world.tick;
    server.tick();
    server.tick();

    expect(server.world.tick).toBeGreaterThan(tickBefore);
  });

  test("preview snapshots parse on the client wire schema", async () => {
    const network = new FakeNetworkServer();
    const gameConfig = new GameConfig();
    const server = new GameServer(gameConfig, network, {
      enableMatchmaking: false,
    });
    const handleHello = (
      server as unknown as {
        handleHello(
          clientId: string,
          helloMessage: {
            t: "hello";
            compatHash: string;
            preview?: boolean;
          },
        ): Promise<void>;
      }
    ).handleHello.bind(server);

    await handleHello("preview-client", {
      t: "hello",
      compatHash: gameConfig.compatHash,
      preview: true,
    });
    server.tick();
    server.tick();

    const snapshotMessage = network.sent
      .filter((entry) => entry.clientId === "preview-client")
      .map((entry) => parseServerToClientMessage(entry.data))
      .find((message) => message?.t === "snapshot");
    expect(snapshotMessage?.t).toBe("snapshot");
    if (snapshotMessage?.t !== "snapshot") {
      throw new Error("expected preview snapshot");
    }

    expect(
      WorldSnapshotSchema.safeParse(snapshotMessage.snapshot).success,
    ).toBe(true);
    expect(
      snapshotMessage.snapshot.extraction.boardTimerGoalTicks,
    ).toBeGreaterThan(0);
  });
});
