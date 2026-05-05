import { beforeAll, describe, expect, test } from "bun:test";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import type { ActionMessage } from "@shared/net/protocol.ts";
import { Chest } from "@server/entities/buildings/Chest.ts";
import { Recycler } from "@server/entities/buildings/Recycler.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { Fists } from "@server/items/weapons/Fists.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  tick,
} from "@tests/helpers/worldFixtures.ts";

const wallItemId = makeResourceId("item", "wall");
const hunkItemId = makeResourceId("item", "hunk");

function addWallAndFindSlot(
  player: ReturnType<typeof connectTestClient>["player"],
): number {
  player.inventory.addStackable(wallItemId, 1);
  const slotIndex = player.inventory.hotbarSlots.findIndex(
    (slot) => slot?.kind === "buildable" && slot.typeId === wallItemId,
  );
  expect(slotIndex).toBeGreaterThanOrEqual(0);
  return slotIndex;
}

function findEmptyHotbarSlot(
  player: ReturnType<typeof connectTestClient>["player"],
): number {
  const slotIndex = player.inventory.hotbarSlots.findIndex((slot) => !slot);
  expect(slotIndex).toBeGreaterThanOrEqual(0);
  return slotIndex;
}

function enqueueAction(
  runtime: ReturnType<typeof makeRuntime>["runtime"],
  action: ActionMessage,
): void {
  runtime.handleAction("client-1", action);
  tick(runtime, 1);
}

describe("inventory authority", () => {
  beforeAll(bootstrapTestRegistries);

  test("valid inventory move updates hotbar", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const wallSlotIndex = addWallAndFindSlot(player);
    const targetSlotIndex = findEmptyHotbarSlot(player);
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "inventoryMove",
      inventoryMove: {
        fromSlotIndex: wallSlotIndex,
        toSlotIndex: targetSlotIndex,
      },
    });
    expect(player.inventory.hotbarSlots[wallSlotIndex]).toBeNull();
    expect(player.inventory.hotbarSlots[targetSlotIndex]?.kind).toBe(
      "buildable",
    );
  });

  test("invalid inventory slot does not mutate", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const wallSlotIndex = addWallAndFindSlot(player);
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "inventoryMove",
      inventoryMove: { fromSlotIndex: 99, toSlotIndex: 1 },
    });
    expect(player.inventory.hotbarSlots[wallSlotIndex]?.kind).toBe("buildable");
  });

  test("chest move too far does not mutate", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const chest = new Chest(runtime.world.allocEntityId(), 1, player.id);
    chest.x = player.x + 1000;
    chest.y = player.y;
    runtime.world.spawn(chest);
    const wallSlotIndex = addWallAndFindSlot(player);
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "chestMove",
      chestMove: {
        chestEntityId: chest.id,
        fromSource: "hotbar",
        fromIndex: wallSlotIndex,
        toSource: "chest",
        toIndex: 0,
      },
    });
    expect(player.inventory.hotbarSlots[wallSlotIndex]).not.toBeNull();
    expect(chest.getSlot(0)).toBeNull();
  });

  test("chest move valid transfers item", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const chest = new Chest(runtime.world.allocEntityId(), 1, player.id);
    chest.x = player.x + 20;
    chest.y = player.y;
    runtime.world.spawn(chest);
    const wallSlotIndex = addWallAndFindSlot(player);
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "chestMove",
      chestMove: {
        chestEntityId: chest.id,
        fromSource: "hotbar",
        fromIndex: wallSlotIndex,
        toSource: "chest",
        toIndex: 0,
      },
    });
    expect(player.inventory.hotbarSlots[wallSlotIndex]).toBeNull();
    expect(chest.getSlot(0)?.kind).toBe("buildable");
  });

  test("drop action spawns a pickup", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.inventory.addStackable(wallItemId, 1);
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "drop",
      dropWholeStack: true,
    });
    const pickups = runtime.world.entities
      .all()
      .filter((entity) => entity instanceof ItemEntity);
    expect(pickups.length).toBeGreaterThan(0);
  });

  test("pickup action collects overlapping item", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const pickupInventory = new Inventory();
    pickupInventory.addStackable(wallItemId, 1);
    const pickup = new ItemEntity(
      runtime.world.allocEntityId(),
      pickupInventory,
    );
    pickup.x = player.x;
    pickup.y = player.y;
    runtime.world.spawn(pickup);
    runtime.world.ensureSpatialIndex();
    enqueueAction(runtime, { t: "action", seq: 1, action: "pickup" });
    expect(runtime.world.entities.has(pickup.id)).toBe(false);
    expect(player.inventory.countType(wallItemId)).toBeGreaterThan(0);
  });

  test("pickup action fails when inventory is full", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    for (
      let index = 0;
      index < player.inventory.hotbarSlots.length;
      index += 1
    ) {
      player.inventory.addWeapon(new Fists());
    }
    const pickupInventory = new Inventory();
    pickupInventory.addWeapon(new Fists());
    const pickup = new ItemEntity(
      runtime.world.allocEntityId(),
      pickupInventory,
    );
    pickup.x = player.x;
    pickup.y = player.y;
    runtime.world.spawn(pickup);
    runtime.world.ensureSpatialIndex();
    enqueueAction(runtime, { t: "action", seq: 1, action: "pickup" });
    expect(runtime.world.entities.has(pickup.id)).toBe(true);
  });

  test("recycle near recycler grants hunks", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const recycler = new Recycler(runtime.world.allocEntityId());
    recycler.x = player.x + 10;
    recycler.y = player.y;
    runtime.world.spawn(recycler);
    const wallSlotIndex = addWallAndFindSlot(player);
    player.inventory.setSelectedHotbarIndex(wallSlotIndex);
    const before = player.inventory.getResourceCount(hunkItemId);
    enqueueAction(runtime, { t: "action", seq: 1, action: "recycle" });
    expect(player.inventory.getResourceCount(hunkItemId)).toBeGreaterThan(
      before,
    );
  });

  test("recycle away from recycler does nothing", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    for (const entity of runtime.world.entities.all()) {
      if (entity instanceof Recycler) {
        runtime.world.despawn(entity.id);
      }
    }
    const recycler = new Recycler(runtime.world.allocEntityId());
    recycler.x = player.x + 2000;
    recycler.y = player.y;
    runtime.world.spawn(recycler);
    const wallSlotIndex = addWallAndFindSlot(player);
    player.inventory.setSelectedHotbarIndex(wallSlotIndex);
    const before = player.inventory.getResourceCount(hunkItemId);
    enqueueAction(runtime, { t: "action", seq: 1, action: "recycle" });
    expect(player.inventory.getResourceCount(hunkItemId)).toBe(before);
  });
});
