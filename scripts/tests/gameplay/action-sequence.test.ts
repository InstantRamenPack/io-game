import { beforeAll, describe, expect, test } from "bun:test";
import type { ActionMessage, InputIntentMessage } from "@shared/net/protocol.ts";
import type { WorldSnapshot } from "@shared/net/snapshots.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
} from "../helpers/worldFixtures.ts";

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

function latestSnapshot(network: ReturnType<typeof makeRuntime>["network"]): WorldSnapshot {
  for (let index = network.sent.length - 1; index >= 0; index -= 1) {
    const entry = network.sent[index];
    if (!entry || typeof entry.data !== "string") {
      continue;
    }
    if (!entry.data.includes('"t":"snapshot"')) {
      continue;
    }
    return JSON.parse(entry.data).snapshot as WorldSnapshot;
  }
  throw new Error("snapshot not found");
}

describe("action sequence authority", () => {
  beforeAll(bootstrapTestRegistries);

  test("stale input does not advance lastProcessedSeq", () => {
    const { runtime, network } = makeRuntime();
    connectTestClient(runtime);
    runtime.handleInputIntent("client-1", makeInput(2));
    runtime.handleInputIntent("client-1", makeInput(1));
    runtime.tick();
    expect(latestSnapshot(network).lastProcessedSeq).toBe(2);
  });

  test("duplicate action is ignored", () => {
    const { runtime, network } = makeRuntime();
    connectTestClient(runtime);
    runtime.handleAction("client-1", makeAction(1));
    runtime.handleAction("client-1", makeAction(1));
    runtime.tick();
    expect(latestSnapshot(network).lastProcessedSeq).toBe(1);
  });

  test("input and action sequences are independently tracked", () => {
    const { runtime, network } = makeRuntime();
    connectTestClient(runtime);
    runtime.handleInputIntent("client-1", makeInput(2));
    runtime.handleAction("client-1", makeAction(5));
    runtime.tick();
    expect(latestSnapshot(network).lastProcessedSeq).toBe(5);
  });

  test("invalid action does not advance lastProcessedSeq", () => {
    const { runtime, network } = makeRuntime();
    connectTestClient(runtime);
    runtime.handleInputIntent("client-1", makeInput(1));
    runtime.handleAction("client-1", {
      t: "action",
      seq: 2,
      action: "selectHotbar",
      index: 999,
    });
    runtime.tick();
    expect(latestSnapshot(network).lastProcessedSeq).toBe(1);
  });
});
