import { beforeAll, describe, expect, test } from "bun:test";
import { Player } from "@server/entities/Player.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
} from "@tests/helpers/worldFixtures.ts";

describe("debug spectator player", () => {
  beforeAll(bootstrapTestRegistries);

  test("debug player is faster and keeps dynamic movement mode", () => {
    const normal = new Player(1, "player");
    const debug = new Player(2, "debug");

    expect(debug.moveSpeed).toBeGreaterThan(normal.moveSpeed);
    expect(debug.collisionMode).toBe("dynamic");
  });

  test("debug player can still build", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1", "debug");

    expect(
      runtime.antiCheatValidator.validateAction(
        {
          t: "action",
          seq: 1,
          action: "build",
          build: { x: player.x, y: player.y },
        },
        player,
        runtime.world,
      ),
    ).toBe(true);
  });

  test("debug player still moves from input intent", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1", "debug");
    const startX = player.x;

    runtime.handleInputIntent("client-1", {
      t: "input",
      seq: 1,
      theta: 0,
      movement: { up: false, down: false, left: false, right: true },
    });
    runtime.world.step();
    runtime.world.step();

    expect(player.x).toBeGreaterThan(startX);
  });
});
