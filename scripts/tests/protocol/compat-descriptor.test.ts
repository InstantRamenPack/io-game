import { describe, expect, test } from "bun:test";
import { PROTOCOL_COMPAT_DESCRIPTOR } from "@shared/net/protocol.ts";
import {
  EntitySnapshotBaseSchema,
  EquippedItemSnapshotSchema,
  SNAPSHOT_COMPAT_DESCRIPTOR,
  WorldSnapshotSchema,
} from "@shared/net/snapshots.ts";
import type { z } from "zod";

type ObjectSchema = z.ZodObject<z.ZodRawShape>;

function schemaKeys(schema: ObjectSchema): readonly string[] {
  return Object.freeze([...schema.keyof().options]);
}

function expectSameKeys(
  label: string,
  left: readonly string[],
  right: readonly string[],
): void {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const missing = right.filter((key) => !leftSet.has(key));
  const extra = left.filter((key) => !rightSet.has(key));
  expect(missing, `${label} missing keys: ${missing.join(",")}`).toHaveLength(
    0,
  );
  expect(extra, `${label} extra keys: ${extra.join(",")}`).toHaveLength(0);
}

describe("compat descriptors", () => {
  test("protocol descriptors are unique and include expected tags", () => {
    const clientTags = PROTOCOL_COMPAT_DESCRIPTOR.clientToServer;
    const serverTags = PROTOCOL_COMPAT_DESCRIPTOR.serverToClient;
    expect(new Set(clientTags).size).toBe(clientTags.length);
    expect(new Set(serverTags).size).toBe(serverTags.length);
    expect(clientTags).toEqual(
      expect.arrayContaining([
        "hello",
        "input",
        "action:attack",
        "action:build",
        "action:inventoryMove",
        "action:selectHotbar",
        "action:chestMove",
        "action:drop",
        "action:pickup",
        "action:recycle",
        "action:craft",
        "lobby:join",
        "lobby:joinByCode",
        "lobby:leave",
        "ping",
        "chat",
      ]),
    );
    expect(serverTags).toEqual(
      expect.arrayContaining([
        "snapshot",
        "pong",
        "welcome",
        "error",
        "chat",
        "lobby_state",
        "game_complete",
      ]),
    );
  });

  test("snapshot descriptors cover schema keys", () => {
    expectSameKeys(
      "snapshot world",
      SNAPSHOT_COMPAT_DESCRIPTOR.world,
      schemaKeys(WorldSnapshotSchema),
    );
    expectSameKeys(
      "snapshot entity base",
      SNAPSHOT_COMPAT_DESCRIPTOR.entityBase,
      schemaKeys(EntitySnapshotBaseSchema),
    );
    expectSameKeys(
      "snapshot equipped item",
      SNAPSHOT_COMPAT_DESCRIPTOR.equippedItem,
      schemaKeys(EquippedItemSnapshotSchema),
    );
  });
});
