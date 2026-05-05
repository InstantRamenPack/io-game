import { describe, expect, test } from "bun:test";
import {
  CHEST_SLOT_COUNT,
  EntitySnapshotSchema,
  InventorySnapshotSchema,
  WorldSnapshotSchema,
} from "@shared/net/snapshots.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import {
  makeBuildingSnapshot,
  makeDayNightSnapshot,
  makeEnemySnapshot,
  makeInventorySnapshot,
  makePickupSnapshot,
  makePlayerSnapshot,
  makeProjectileSnapshot,
  makeSnapshot,
  makeStructureSnapshot,
} from "../helpers/snapshotFixtures.ts";

describe("snapshot schema", () => {
  test("valid entity snapshots parse", () => {
    const snapshots = [
      makePlayerSnapshot(1, 10, 20),
      makeEnemySnapshot(2, 30, 40),
      makeBuildingSnapshot(3, 50, 60),
      makeStructureSnapshot(4, 70, 80),
      makeProjectileSnapshot(5, 90, 100),
      makePickupSnapshot(6, 120, 140),
    ];

    for (const snapshot of snapshots) {
      expect(EntitySnapshotSchema.safeParse(snapshot).success).toBe(true);
    }
  });

  test("delta entity snapshot without hitboxes parses", () => {
    const delta = { ...makePlayerSnapshot(1, 0, 0), hitboxes: undefined };
    expect(EntitySnapshotSchema.safeParse(delta).success).toBe(true);
  });

  test("invalid world snapshots are rejected", () => {
    const invalidSnapshots = [
      {
        ...makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]),
        tick: -1,
      },
      {
        ...makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]),
        lastProcessedSeq: -2,
      },
      {
        ...makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]),
        removedEntityIds: [-4],
      },
      {
        ...makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]),
        dayNight: { ...makeDayNightSnapshot(1), phase: "dawn" },
      },
      {
        ...makeSnapshot(1, [makePlayerSnapshot(1, 0, 0)]),
        events: [{ type: "damage" }],
      },
    ];

    for (const snapshot of invalidSnapshots) {
      expect(WorldSnapshotSchema.safeParse(snapshot).success).toBe(false);
    }
  });

  test("invalid entity snapshots are rejected", () => {
    const invalidSnapshots = [
      { ...makePlayerSnapshot(1, 0, 0), kind: "unknown" },
      { ...makePlayerSnapshot(1, 0, 0), typeId: "bad" },
      {
        ...makeBuildingSnapshot(1, 0, 0),
        chestSlots: Array.from({ length: CHEST_SLOT_COUNT - 1 }, () => ({
          kind: "empty",
        })),
      },
    ];

    for (const snapshot of invalidSnapshots) {
      expect(EntitySnapshotSchema.safeParse(snapshot).success).toBe(false);
    }
  });

  test("inventory snapshot length rules are enforced", () => {
    const inventory = makeInventorySnapshot();
    const invalidInventory = {
      ...inventory,
      hotbarSlots: inventory.hotbarSlots.slice(0, 5),
    };
    expect(InventorySnapshotSchema.safeParse(invalidInventory).success).toBe(
      false,
    );
  });

  test("invalid resource ids are rejected", () => {
    const inventory = makeInventorySnapshot();
    const invalidResourceInventory = {
      ...inventory,
      resources: [{ typeId: "invalid", amount: 1 }],
    };
    expect(
      InventorySnapshotSchema.safeParse(invalidResourceInventory).success,
    ).toBe(false);

    const invalidBuildable = {
      ...makePlayerSnapshot(1, 0, 0),
      inventory: {
        ...inventory,
        hotbarSlots: [
          { kind: "buildable", typeId: "bad", count: 1 },
          ...inventory.hotbarSlots.slice(1),
        ],
      },
    };
    expect(EntitySnapshotSchema.safeParse(invalidBuildable).success).toBe(
      false,
    );

    const validBuildable = {
      ...makePlayerSnapshot(2, 0, 0),
      inventory: {
        ...inventory,
        hotbarSlots: [
          {
            kind: "buildable",
            typeId: makeResourceId("item", "wall"),
            count: 1,
          },
          ...inventory.hotbarSlots.slice(1),
        ],
      },
    };
    expect(EntitySnapshotSchema.safeParse(validBuildable).success).toBe(true);
  });
});
