import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseClientToServerMessage } from "@shared/net/protocol.ts";
import type { InputIntentMessage } from "@shared/net/protocol.ts";
import { parseFastInputMessage } from "@server/net/FastInputMessageParser.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  tick,
} from "../helpers/worldFixtures.ts";

const emptyMovement = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
});

function makeInput(
  seq: number,
  movement: InputIntentMessage["movement"],
  theta = 0,
): InputIntentMessage {
  return {
    t: "input",
    seq,
    clientTimeMs: seq * 10,
    theta,
    movement,
  };
}

function movingRight(): InputIntentMessage["movement"] {
  return { ...emptyMovement, right: true };
}

function movingLeft(): InputIntentMessage["movement"] {
  return { ...emptyMovement, left: true };
}

function movingDownRight(): InputIntentMessage["movement"] {
  return { ...emptyMovement, right: true, down: true };
}

describe("server input sequencing", () => {
  beforeAll(bootstrapTestRegistries);

  test("server-authoritative movement is driven by input intent", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const startX = player.x;
    runtime.handleInputIntent("client-1", makeInput(1, movingRight()));
    tick(runtime, 3);
    expect(player.x).toBeGreaterThan(startX);
    expect(player.vx).toBeGreaterThan(0);
  });

  test("client input protocol rejects authoritative x/y", () => {
    const raw = JSON.stringify({
      t: "input",
      seq: 1,
      clientTimeMs: 1,
      x: 100,
      y: 200,
      theta: 0,
      movement: emptyMovement,
    });
    expect(parseClientToServerMessage(raw)).toBeNull();
    expect(parseFastInputMessage(raw).kind).toBe("invalid");

    const wsClientSource = readFileSync(
      "apps/client/src/net/WsClient.ts",
      "utf8",
    );
    expect(wsClientSource.includes("sendPose")).toBe(false);
    expect(wsClientSource.includes('"t":"pose"')).toBe(false);
  });

  test("stale and duplicate input are ignored without corrupting movement", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    runtime.handleInputIntent("client-1", makeInput(2, movingRight()));
    tick(runtime, 2);
    const beforeStaleX = player.x;
    runtime.handleInputIntent("client-1", makeInput(1, movingLeft()));
    runtime.handleInputIntent("client-1", makeInput(2, movingLeft()));
    tick(runtime, 2);
    expect(player.x).toBeGreaterThanOrEqual(beforeStaleX);
  });

  test("out-of-order input does not corrupt movement", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    runtime.handleInputIntent("client-1", makeInput(5, movingRight()));
    runtime.handleInputIntent("client-1", makeInput(4, movingLeft()));
    tick(runtime, 3);
    expect(player.vx).toBeGreaterThan(0);
  });

  test("movement stops cleanly when input stops", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    runtime.handleInputIntent("client-1", makeInput(1, movingRight()));
    tick(runtime, 3);
    expect(player.vx).toBeGreaterThan(0);
    runtime.handleInputIntent("client-1", makeInput(2, { ...emptyMovement }));
    tick(runtime, 6);
    expect(Math.abs(player.vx)).toBeLessThanOrEqual(0.001);
    expect(Math.abs(player.vy)).toBeLessThanOrEqual(0.001);
  });

  test("movement stops cleanly when fresh input is missing", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    runtime.handleInputIntent("client-1", makeInput(1, movingRight()));
    tick(runtime, 3);
    expect(player.vx).toBeGreaterThan(0);
    tick(runtime, 6);
    expect(Math.abs(player.vx)).toBeLessThanOrEqual(0.001);
  });

  test("diagonal movement is normalized", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    runtime.handleInputIntent("client-1", makeInput(1, movingDownRight()));
    tick(runtime, 3);
    expect(Math.hypot(player.vx, player.vy)).toBeLessThanOrEqual(
      player.moveSpeed + 0.001,
    );
    expect(player.vx).toBeGreaterThan(0);
    expect(player.vy).toBeGreaterThan(0);
  });

  test("server collision blocks movement through static blockers", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const wall = new Wall(runtime.world.allocEntityId(), 1, player.id);
    wall.x = player.x + 64;
    wall.y = player.y;
    runtime.world.spawn(wall);
    runtime.world.markSpatialDirty();
    for (let seq = 1; seq <= 8; seq += 1) {
      runtime.handleInputIntent("client-1", makeInput(seq, movingRight()));
      tick(runtime, 3);
    }
    const playerHalfWidth = 16;
    const wallHalfWidth = 20;
    expect(player.x + playerHalfWidth).toBeLessThanOrEqual(
      wall.x - wallHalfWidth + 0.01,
    );
  });
});
