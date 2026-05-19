import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { WsClient } from "@client/net/WsClient.ts";
import { COMPAT_HASH } from "@shared/config/compat.ts";
import {
  makeSnapshot,
  makePlayerSnapshot,
} from "@tests/helpers/snapshotFixtures.ts";
import { FakeWebSocket } from "@tests/helpers/fakeNetwork.ts";
import { parseClientToServerMessage } from "@shared/net/protocol.ts";

function decodeSentPacket(packet: string | Uint8Array): unknown {
  return parseClientToServerMessage(packet);
}

const originalWebSocket = globalThis.WebSocket;

describe("websocket client", () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  test("connect sends hello", () => {
    const client = new WsClient();
    client.connect("ws://test", { playerName: "tester" });
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    expect(socket.sent.length).toBe(1);
    const hello = decodeSentPacket(socket.sent[0]!) as Record<string, unknown>;
    expect(hello.t).toBe("hello");
    expect(hello.compatHash).toBe(COMPAT_HASH);
    expect(hello.playerName).toBe("tester");
  });

  test("hello bypasses debug simulation", () => {
    const client = new WsClient();
    client.setDebugNetworkProfile("mild", 1);
    client.connect("ws://test");
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    expect(socket.sent.length).toBe(1);
  });

  test("input sends seq/clientTimeMs/theta/movement", () => {
    const client = new WsClient();
    client.connect("ws://test");
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    client.sendInputIntent(2, 120, 0.5, {
      up: true,
      down: false,
      left: false,
      right: true,
    });
    const payload = decodeSentPacket(socket.sent.at(-1)!) as {
      t: string;
      seq: number;
      clientTimeMs: number;
      theta: number;
      movement: { right: boolean };
    };
    expect(payload.t).toBe("input");
    expect(payload.seq).toBe(2);
    expect(payload.clientTimeMs).toBe(120);
    expect(payload.theta).toBeCloseTo(0.5, 4);
    expect(payload.movement.right).toBe(true);
  });

  test("action sends exact payload", () => {
    const client = new WsClient();
    client.connect("ws://test");
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    client.sendAction({ t: "action", seq: 1, action: "attack", theta: 0 });
    const payload = decodeSentPacket(socket.sent.at(-1)!);
    expect(payload).toEqual({
      t: "action",
      seq: 1,
      action: "attack",
      theta: 0,
    });
  });

  test("disconnected send is no-op", () => {
    const client = new WsClient();
    client.sendInputIntent(1, 10, 0, {
      up: false,
      down: false,
      left: false,
      right: true,
    });
    expect(FakeWebSocket.instances.length).toBe(0);
  });

  test("inbound valid snapshot invokes handler", () => {
    const client = new WsClient();
    client.connect("ws://test");
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    let handled = false;
    client.onSnapshot(() => {
      handled = true;
    });
    const snapshot = makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]);
    socket.emitMessage(JSON.stringify({ t: "snapshot", snapshot }));
    expect(handled).toBe(true);
  });

  test("inbound malformed ignored", () => {
    const client = new WsClient();
    client.connect("ws://test");
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    let handled = false;
    client.onSnapshot(() => {
      handled = true;
    });
    socket.emitMessage("not-json");
    expect(handled).toBe(false);
  });

  test("inbound error invokes error handler", () => {
    const client = new WsClient();
    client.connect("ws://test");
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    const errorMessages: string[] = [];
    client.onError((message) => {
      errorMessages.push(message);
    });
    socket.emitError();
    expect(errorMessages).toEqual(["socket_error"]);
  });

  test("close clears socket", () => {
    const client = new WsClient();
    client.connect("ws://test");
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    socket.close();
    expect(client.socket).toBeUndefined();
  });

  test("debug outbound delay/drop works", () => {
    const client = new WsClient();
    client.connect("ws://test");
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    client.setDebugNetworkProfile("mild", 1);
    client.sendInputIntent(1, 10, 0, {
      up: false,
      down: false,
      left: false,
      right: true,
    });
    const metrics = client.getDebugNetworkMetrics();
    expect(metrics.outbound.sentPacketCount).toBeGreaterThan(0);
    expect(socket.sent.length).toBeGreaterThan(0);
  });

  test("debug inbound delay/drop works", () => {
    const client = new WsClient();
    client.connect("ws://test");
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    client.setDebugNetworkProfile("mild", 1);
    const snapshot = makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]);
    socket.emitMessage(JSON.stringify({ t: "snapshot", snapshot }));
    const metrics = client.getDebugNetworkMetrics();
    expect(metrics.inbound.sentPacketCount).toBeGreaterThan(0);
  });

  test("disable debug clears timers", () => {
    const client = new WsClient();
    client.connect("ws://test");
    const socket = FakeWebSocket.instances[0]!;
    socket.emitOpen();
    client.setDebugNetworkProfile("mild", 1);
    client.disableDebugNetworkSimulation();
    client.sendInputIntent(1, 10, 0, {
      up: false,
      down: false,
      left: false,
      right: true,
    });
    const metrics = client.getDebugNetworkMetrics();
    expect(metrics.outbound.enabled).toBe(false);
    expect(metrics.inbound.enabled).toBe(false);
    expect(socket.sent.length).toBeGreaterThan(0);
  });
});
