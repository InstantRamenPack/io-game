import { describe, expect, test } from "bun:test";
import {
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHEST_INDEX,
  MAX_HOTBAR_INDEX,
} from "@shared/gameplay/constants.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import { parseClientToServerMessage } from "@shared/net/protocol.ts";

const baseMovement = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
});

describe("protocol parser", () => {
  test("input messages accept valid payloads", () => {
    const samples = [
      {
        t: "input",
        seq: 0,
        clientTimeMs: 0,
        theta: 0,
        movement: baseMovement,
      },
      {
        t: "input",
        seq: 42,
        theta: Math.PI * 4.2,
        movement: { ...baseMovement, right: true },
      },
      {
        t: "input",
        seq: Number.MAX_SAFE_INTEGER,
        clientTimeMs: 1234.56,
        theta: -Math.PI * 8.1,
        movement: { ...baseMovement, up: true },
      },
    ];

    for (const sample of samples) {
      const parsed = parseClientToServerMessage(JSON.stringify(sample));
      expect(parsed?.t).toBe("input");
      if (parsed?.t === "input") {
        expect(parsed.seq).toBe(sample.seq);
        expect(parsed.movement).toEqual(sample.movement);
        expect(parsed.theta).toBeCloseTo(normalizeAngle(sample.theta), 6);
      }
    }
  });

  test("input messages reject invalid payloads", () => {
    const invalidPayloads = [
      { t: "input", seq: -1, theta: 0, movement: baseMovement },
      { t: "input", seq: 1.5, theta: 0, movement: baseMovement },
      { t: "input", seq: 1, theta: "nope", movement: baseMovement },
      { t: "input", seq: 1, theta: null, movement: baseMovement },
      { t: "input", seq: 1, theta: 0 },
      {
        t: "input",
        seq: 1,
        theta: 0,
        movement: { up: true, down: false, left: false },
      },
      {
        t: "input",
        seq: 1,
        theta: 0,
        movement: { ...baseMovement, extra: true },
      },
      {
        t: "input",
        seq: 1,
        theta: 0,
        movement: baseMovement,
        x: 100,
        y: 200,
      },
      {
        t: "input",
        seq: 1,
        theta: 0,
        movement: baseMovement,
        extra: "oops",
      },
      { t: "pose", seq: 1 },
    ];

    for (const payload of invalidPayloads) {
      const parsed = parseClientToServerMessage(JSON.stringify(payload));
      expect(parsed).toBeNull();
    }

    const invalidRaw = ["{", "[]", "null"];
    for (const raw of invalidRaw) {
      expect(parseClientToServerMessage(raw)).toBeNull();
    }
  });

  test("action messages accept valid payloads", () => {
    const buildableId = makeResourceId("item", "wall");
    const samples = [
      { t: "action", seq: 1, action: "attack", theta: 0 },
      {
        t: "action",
        seq: 2,
        action: "craft",
        craft: { itemTypeId: buildableId },
      },
      { t: "action", seq: 3, action: "build", build: { x: 5, y: 10 } },
      {
        t: "action",
        seq: 4,
        action: "inventoryMove",
        inventoryMove: { fromSlotIndex: 0, toSlotIndex: 1 },
      },
      { t: "action", seq: 5, action: "selectHotbar", index: 0 },
      {
        t: "action",
        seq: 6,
        action: "chestMove",
        chestMove: {
          chestEntityId: 12,
          fromSource: "hotbar",
          fromIndex: 0,
          toSource: "chest",
          toIndex: 0,
        },
      },
      { t: "action", seq: 7, action: "drop", dropWholeStack: false },
      { t: "action", seq: 8, action: "pickup" },
      { t: "action", seq: 9, action: "recycle" },
    ];

    for (const payload of samples) {
      const parsed = parseClientToServerMessage(JSON.stringify(payload));
      expect(parsed?.t).toBe("action");
    }
  });

  test("action messages reject invalid payloads", () => {
    const buildableId = makeResourceId("item", "wall");
    const invalidPayloads = [
      { t: "action", seq: -1, action: "attack", theta: 0 },
      { t: "action", seq: 1, action: "attack" },
      {
        t: "action",
        seq: 2,
        action: "craft",
        craft: { itemTypeId: "bad" },
      },
      { t: "action", seq: 3, action: "build", build: { x: "a", y: 2 } },
      {
        t: "action",
        seq: 4,
        action: "inventoryMove",
        inventoryMove: { fromSlotIndex: 0, toSlotIndex: MAX_HOTBAR_INDEX + 1 },
      },
      {
        t: "action",
        seq: 5,
        action: "selectHotbar",
        index: MAX_HOTBAR_INDEX + 1,
      },
      {
        t: "action",
        seq: 6,
        action: "chestMove",
        chestMove: {
          chestEntityId: 12,
          fromSource: "chest",
          fromIndex: 0,
          toSource: "hotbar",
          toIndex: MAX_CHEST_INDEX + 1,
        },
      },
      { t: "action", seq: 7, action: "drop" },
    ];

    for (const payload of invalidPayloads) {
      const parsed = parseClientToServerMessage(JSON.stringify(payload));
      expect(parsed).toBeNull();
    }
  });

  test("hello/chat/ping/lobby accept valid payloads", () => {
    const maxChat = "x".repeat(MAX_CHAT_MESSAGE_LENGTH);
    const valid = [
      { t: "hello", compatHash: "abc123" },
      {
        t: "hello",
        compatHash: "abc123",
        playerName: "tester",
      },
      { t: "ping", timeMs: 1234 },
      { t: "chat", text: maxChat },
      { t: "lobby", action: "join" },
      { t: "lobby", action: "joinByCode", lobbyCode: "ABCD_123" },
      { t: "lobby", action: "leave" },
    ];

    for (const payload of valid) {
      const parsed = parseClientToServerMessage(JSON.stringify(payload));
      expect(parsed).not.toBeNull();
    }
  });

  test("hello/chat/lobby reject invalid payloads", () => {
    const invalid = [
      { t: "hello", compatHash: "" },
      { t: "chat", text: "x".repeat(MAX_CHAT_MESSAGE_LENGTH + 1) },
      { t: "lobby", action: "joinByCode", lobbyCode: "ab" },
      { t: "lobby", action: "joinByCode", lobbyCode: "no spaces" },
      { t: "ping", timeMs: "oops" },
    ];

    for (const payload of invalid) {
      const parsed = parseClientToServerMessage(JSON.stringify(payload));
      expect(parsed).toBeNull();
    }
  });
});
