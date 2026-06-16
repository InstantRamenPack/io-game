import { beforeAll, describe, expect, test } from "bun:test";
import type {
  ActionMessage,
  InputIntentMessage,
} from "@shared/net/protocol.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
} from "@tests/helpers/worldFixtures.ts";

const emptyMovement = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
});

function makeInput(seq: number): InputIntentMessage {
  return {
    t: "input",
    seq,
    clientTimeMs: seq * 10,
    theta: 0,
    movement: emptyMovement,
  };
}

function makeAction(seq: number): ActionMessage {
  return {
    t: "action",
    seq,
    action: "selectHotbar",
    index: 0,
  };
}

function makeMovingInput(
  seq: number,
  movement: InputIntentMessage["movement"],
): InputIntentMessage {
  return {
    ...makeInput(seq),
    movement,
  };
}

describe("action sequence authority", () => {
  beforeAll(bootstrapTestRegistries);

  test("stale input does not replace newer movement intent", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const startX = player.x;
    runtime.handleInputIntent(
      "client-1",
      makeMovingInput(2, {
        ...emptyMovement,
        right: true,
      }),
    );
    runtime.handleInputIntent(
      "client-1",
      makeMovingInput(1, {
        ...emptyMovement,
        left: true,
      }),
    );
    runtime.tick();
    expect(player.x).toBeGreaterThan(startX);
  });

  test("duplicate action is ignored", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    runtime.handleAction("client-1", makeAction(1));
    runtime.handleAction("client-1", makeAction(1));
    expect(player.getQueuedActionCount()).toBe(1);
  });

  test("input and action sequences are independently tracked", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const startX = player.x;
    runtime.handleInputIntent(
      "client-1",
      makeMovingInput(2, {
        ...emptyMovement,
        right: true,
      }),
    );
    runtime.handleAction("client-1", makeAction(5));
    runtime.tick();
    expect(player.x).toBeGreaterThan(startX);
    expect(player.inventory.selectedHotbarIndex).toBe(0);
  });

  test("invalid action does not consume its sequence number", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    runtime.handleAction("client-1", {
      t: "action",
      seq: 2,
      action: "selectHotbar",
      index: 999,
    });
    runtime.handleAction("client-1", {
      t: "action",
      seq: 2,
      action: "selectHotbar",
      index: 1,
    });
    runtime.tick();
    expect(player.inventory.selectedHotbarIndex).toBe(1);
  });
});
