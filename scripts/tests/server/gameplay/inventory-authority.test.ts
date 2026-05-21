import { beforeAll, describe, expect, test } from "bun:test";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import type { ActionMessage } from "@shared/net/protocol.ts";
import { Chest } from "@server/entities/buildings/Chest.ts";
import { Recycler } from "@server/entities/buildings/Recycler.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { Fists } from "@server/items/weapons/Fists.ts";
import { itemTypeRegistry } from "@server/registry/registries.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  tick,
} from "@tests/helpers/worldFixtures.ts";

const wallItemId = makeResourceId("item", "wall");
const hunkItemId = makeResourceId("item", "hunk");
const crudeBandageItemId = makeResourceId("item", "crude_bandage");
const speedPotionItemId = makeResourceId("item", "speed_potion");
const speedEffectId = makeResourceId("effect", "speed");
const basicRifleItemId = makeResourceId("item", "basic_rifle");
const basicRifleBlueprintItemId = makeResourceId(
  "item",
  "blueprint_basic_rifle",
);

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

  test("item acquisition grants stackables, weapons, and blueprint unlocks by item type", () => {
    const inventory = new Inventory();

    expect(
      inventory.grantItemCtor(itemTypeRegistry.require(hunkItemId).ctor, 3),
    ).toBe(true);
    expect(inventory.getResourceCount(hunkItemId)).toBe(3);

    expect(
      inventory.grantItemCtor(
        itemTypeRegistry.require(basicRifleItemId).ctor,
        1,
      ),
    ).toBe(true);
    expect(inventory.countType(basicRifleItemId)).toBe(1);

    expect(
      inventory.grantItemCtor(
        itemTypeRegistry.require(basicRifleBlueprintItemId).ctor,
        1,
      ),
    ).toBe(true);
    expect(inventory.isRecipeUnlocked(basicRifleItemId)).toBe(true);
    expect(inventory.countType(basicRifleBlueprintItemId)).toBe(0);
  });

  test("inventory acquisition transfer unlocks blueprints without storing them", () => {
    const target = new Inventory();
    const source = new Inventory();
    source.addStackable(basicRifleBlueprintItemId, 1);
    source.addStackable(hunkItemId, 2);

    expect(target.absorbInventoryByAcquisitionRules(source)).toBe(true);
    expect(target.isRecipeUnlocked(basicRifleItemId)).toBe(true);
    expect(target.countType(basicRifleBlueprintItemId)).toBe(0);
    expect(target.getResourceCount(hunkItemId)).toBe(2);
  });

  test("auto-picking a blueprint unlocks the recipe for every player", () => {
    const { runtime } = makeRuntime();
    const { player: collector } = connectTestClient(runtime, "client-1");
    const { player: teammate } = connectTestClient(runtime, "client-2");
    teammate.x = collector.x + 1000;
    teammate.y = collector.y;

    const pickupInventory = new Inventory();
    pickupInventory.addStackable(basicRifleBlueprintItemId, 1);
    const pickup = new ItemEntity(
      runtime.world.allocEntityId(),
      pickupInventory,
    );
    pickup.x = collector.x;
    pickup.y = collector.y;
    runtime.world.spawn(pickup);

    expect(collector.inventory.isRecipeUnlocked(basicRifleItemId)).toBe(false);
    expect(teammate.inventory.isRecipeUnlocked(basicRifleItemId)).toBe(false);
    tick(runtime, 1);
    expect(collector.inventory.isRecipeUnlocked(basicRifleItemId)).toBe(true);
    expect(teammate.inventory.isRecipeUnlocked(basicRifleItemId)).toBe(true);
    expect(runtime.world.entities.has(pickup.id)).toBe(false);
  });

  test("new players start with the content-authored hunk count", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);

    expect(player.inventory.getResourceCount(hunkItemId)).toBe(50);
  });

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

  test("stackable non-building pickups auto-collect on overlap", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const before = player.inventory.countType(hunkItemId);
    const pickupInventory = new Inventory();
    pickupInventory.addStackable(hunkItemId, 3);
    const pickup = new ItemEntity(
      runtime.world.allocEntityId(),
      pickupInventory,
    );
    pickup.x = player.x;
    pickup.y = player.y;
    runtime.world.spawn(pickup);
    runtime.world.ensureSpatialIndex();

    tick(runtime, 1);

    expect(runtime.world.entities.has(pickup.id)).toBe(false);
    expect(player.inventory.countType(hunkItemId)).toBe(before + 3);
  });

  test("medical pickups collect as bandages instead of healing directly", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.hp = 50;
    const pickupInventory = new Inventory();
    pickupInventory.addStackable(crudeBandageItemId, 2);
    const pickup = new ItemEntity(
      runtime.world.allocEntityId(),
      pickupInventory,
    );
    pickup.x = player.x;
    pickup.y = player.y;
    runtime.world.spawn(pickup);
    runtime.world.ensureSpatialIndex();

    tick(runtime, 1);

    expect(runtime.world.entities.has(pickup.id)).toBe(false);
    expect(player.hp).toBe(50);
    expect(player.inventory.countType(crudeBandageItemId)).toBe(2);
  });

  test("consuming a bandage heals through the healing effect path", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.hp = 50;
    player.inventory.addStackable(crudeBandageItemId, 1);
    const slotIndex = player.inventory.hotbarSlots.findIndex(
      (slot) =>
        slot?.kind === "buildable" && slot.typeId === crudeBandageItemId,
    );
    expect(slotIndex).toBeGreaterThanOrEqual(0);
    player.inventory.selectedHotbarIndex = slotIndex;

    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "useConsumable",
      typeId: crudeBandageItemId,
    });

    expect(player.hp).toBe(60);
    expect(player.inventory.countType(crudeBandageItemId)).toBe(0);
  });

  test("consuming a speed potion applies effect-authored movement speed", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.inventory.addStackable(speedPotionItemId, 1);
    const slotIndex = player.inventory.hotbarSlots.findIndex(
      (slot) => slot?.kind === "buildable" && slot.typeId === speedPotionItemId,
    );
    expect(slotIndex).toBeGreaterThanOrEqual(0);
    player.inventory.selectedHotbarIndex = slotIndex;

    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "useConsumable",
      typeId: speedPotionItemId,
    });

    expect(player.activeEffects).toContainEqual({
      typeId: speedEffectId,
      ticksRemaining: 3600,
      speedMultiplier: 1.35,
    });
    expect(player.inventory.countType(speedPotionItemId)).toBe(0);
  });

  test("weapon and building pickups stay manual", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const buildingInventory = new Inventory();
    buildingInventory.addStackable(wallItemId, 1);
    const buildingPickup = new ItemEntity(
      runtime.world.allocEntityId(),
      buildingInventory,
    );
    buildingPickup.x = player.x;
    buildingPickup.y = player.y;
    runtime.world.spawn(buildingPickup);

    const weaponInventory = new Inventory();
    weaponInventory.addWeapon(new Fists());
    const weaponPickup = new ItemEntity(
      runtime.world.allocEntityId(),
      weaponInventory,
    );
    weaponPickup.x = player.x;
    weaponPickup.y = player.y;
    runtime.world.spawn(weaponPickup);
    runtime.world.ensureSpatialIndex();

    tick(runtime, 1);

    expect(runtime.world.entities.has(buildingPickup.id)).toBe(true);
    expect(runtime.world.entities.has(weaponPickup.id)).toBe(true);
    expect(player.inventory.countType(wallItemId)).toBe(0);
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
