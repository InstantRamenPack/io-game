import { beforeAll, describe, expect, test } from "bun:test";
import {
  getAllItemContentEntries,
  getItemContent,
  requirePlayerStarterLoadout,
} from "@shared/content/catalog.ts";
import { makeResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";
import { TOWER_REPAIR_HP_PER_COST_UNIT } from "@shared/gameplay/constants.ts";
import type { ActionMessage } from "@shared/net/protocol.ts";
import { Hub } from "@server/entities/tower/Hub.ts";
import { CommsTower } from "@server/entities/tower/CommsTower.ts";
import { CrateStructure } from "@server/entities/structures/CrateStructure.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import { BasicGun } from "@server/items/weapons/BasicGun.ts";
import { Fists } from "@server/items/weapons/Fists.ts";
import { requireItemLikeTypeEntry } from "@server/registry/itemLikeRegistry.ts";
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
const basicGunItemId = makeResourceId("item", "basic_gun");
const basicGunMagItemId = makeResourceId("mag", "basic_gun");
const basicRifleItemId = makeResourceId("item", "basic_rifle");
const basicRifleMagItemId = makeResourceId("mag", "basic_rifle");
const heavyPistolItemId = makeResourceId("item", "heavy_pistol");
const heavyPistolBlueprintItemId = makeResourceId("blueprint", "heavy_pistol");
const armorBlueprintItemId = makeResourceId("blueprint", "armor");
const armorTier2ItemId = makeResourceId("item", "armor_t2");
const armorTier3ItemId = makeResourceId("item", "armor_t3");
const armorTier4ItemId = makeResourceId("item", "armor_t4");
const playerBaseTypeId = makeResourceId("player", "base");

function getStarterHunkAmount(): number {
  const hunkStack = requirePlayerStarterLoadout(
    playerBaseTypeId,
  ).stackables.find((stackable) => stackable.typeId === hunkItemId);
  if (!hunkStack) {
    throw new Error("expected starter loadout to include hunk stack");
  }
  return hunkStack.amount;
}

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
      inventory.grantItemCtor(requireItemLikeTypeEntry(hunkItemId).ctor, 3),
    ).toBe(true);
    expect(inventory.getResourceCount(hunkItemId)).toBe(3);

    expect(
      inventory.grantItemCtor(
        requireItemLikeTypeEntry(heavyPistolItemId).ctor,
        1,
      ),
    ).toBe(true);
    expect(inventory.countType(heavyPistolItemId)).toBe(1);

    expect(
      inventory.grantItemCtor(
        requireItemLikeTypeEntry(heavyPistolBlueprintItemId).ctor,
        1,
      ),
    ).toBe(true);
    expect(inventory.isRecipeUnlocked(heavyPistolItemId)).toBe(true);
    expect(inventory.countType(heavyPistolBlueprintItemId)).toBe(0);
  });

  test("manual reload spends one magazine to refill a partially spent selected gun", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1");
    player.inventory.clearHotbar();
    const gun = new BasicGun();
    gun.ammoInMag = Math.max(0, gun.magSize - 5);
    expect(player.inventory.addWeapon(gun)).toBe(true);
    player.inventory.addStackable(basicGunMagItemId, 1);

    enqueueAction(runtime, { t: "action", seq: 1, action: "reload" });

    expect(gun.ammoInMag).toBe(gun.magSize - 5);
    expect(gun.toSnapshot().reloadTicksRemaining).toBeGreaterThan(0);
    tick(runtime, gun.reloadTicks);

    expect(gun.ammoInMag).toBe(gun.magSize);
    expect(player.inventory.countType(basicGunMagItemId)).toBe(0);
  });

  test("inventory acquisition transfer unlocks blueprints without storing them", () => {
    const target = new Inventory();
    const source = new Inventory();
    source.addStackable(heavyPistolBlueprintItemId, 1);
    source.addStackable(hunkItemId, 2);

    expect(target.absorbInventoryByAcquisitionRules(source)).toBe(true);
    expect(target.isRecipeUnlocked(heavyPistolItemId)).toBe(true);
    expect(target.countType(heavyPistolBlueprintItemId)).toBe(0);
    expect(target.getResourceCount(hunkItemId)).toBe(2);
  });

  test("blueprint pickups require pickup action and unlock the recipe for every player", () => {
    const { runtime } = makeRuntime();
    const { player: collector } = connectTestClient(runtime, "client-1");
    const { player: teammate } = connectTestClient(runtime, "client-2");
    teammate.x = collector.x + 1000;
    teammate.y = collector.y;

    const pickupInventory = new Inventory();
    pickupInventory.addStackable(heavyPistolBlueprintItemId, 1);
    const pickup = new ItemEntity(
      runtime.world.allocEntityId(),
      pickupInventory,
    );
    pickup.x = collector.x;
    pickup.y = collector.y;
    runtime.world.spawn(pickup);

    expect(collector.inventory.isRecipeUnlocked(heavyPistolItemId)).toBe(false);
    expect(teammate.inventory.isRecipeUnlocked(heavyPistolItemId)).toBe(false);
    tick(runtime, 1);
    expect(collector.inventory.isRecipeUnlocked(heavyPistolItemId)).toBe(false);
    expect(teammate.inventory.isRecipeUnlocked(heavyPistolItemId)).toBe(false);
    expect(runtime.world.entities.has(pickup.id)).toBe(true);

    enqueueAction(runtime, { t: "action", seq: 1, action: "pickup" });
    expect(collector.inventory.isRecipeUnlocked(heavyPistolItemId)).toBe(true);
    expect(teammate.inventory.isRecipeUnlocked(heavyPistolItemId)).toBe(true);
    expect(runtime.world.entities.has(pickup.id)).toBe(false);
  });

  test("repeat armor blueprint pickups unlock the next locked armor tier", () => {
    const { runtime } = makeRuntime();
    const { player: collector } = connectTestClient(runtime, "client-1");

    for (const [index, expectedRecipeId] of [
      armorTier2ItemId,
      armorTier3ItemId,
      armorTier4ItemId,
    ].entries()) {
      const pickupInventory = new Inventory();
      pickupInventory.addStackable(armorBlueprintItemId, 1);
      const pickup = new ItemEntity(
        runtime.world.allocEntityId(),
        pickupInventory,
      );
      pickup.x = collector.x;
      pickup.y = collector.y;
      runtime.world.spawn(pickup);

      enqueueAction(runtime, {
        t: "action",
        seq: index + 1,
        action: "pickup",
      });
      expect(collector.inventory.isRecipeUnlocked(expectedRecipeId)).toBe(true);
      expect(runtime.world.entities.has(pickup.id)).toBe(false);
    }
  });

  test("blueprint unlocks persist for players who join after pickup", () => {
    const { runtime } = makeRuntime();
    const { player: collector } = connectTestClient(runtime, "client-1");

    const pickupInventory = new Inventory();
    pickupInventory.addStackable(heavyPistolBlueprintItemId, 1);
    const pickup = new ItemEntity(
      runtime.world.allocEntityId(),
      pickupInventory,
    );
    pickup.x = collector.x;
    pickup.y = collector.y;
    runtime.world.spawn(pickup);

    enqueueAction(runtime, { t: "action", seq: 1, action: "pickup" });
    expect(collector.inventory.isRecipeUnlocked(heavyPistolItemId)).toBe(true);

    const { player: lateJoiner } = connectTestClient(runtime, "client-3");
    expect(lateJoiner.inventory.isRecipeUnlocked(heavyPistolItemId)).toBe(true);
  });

  test("map-loaded blueprint crates store concrete blueprint item ids", () => {
    const { runtime } = makeRuntime({ worldSeed: 1337 });
    const expectedBlueprintTypeIds = new Set(
      getAllItemContentEntries()
        .filter(([, item]) => item.unlocksRecipeTypeId)
        .map(([typeId]) => typeId),
    );
    const observedBlueprintTypeIds = new Set<ResourceId>();

    for (const entity of runtime.world.entities.all()) {
      if (!(entity instanceof CrateStructure)) {
        continue;
      }
      for (const blueprintTypeId of expectedBlueprintTypeIds) {
        if (entity.contents.countType(blueprintTypeId) > 0) {
          observedBlueprintTypeIds.add(blueprintTypeId);
        }
      }
    }

    expect(observedBlueprintTypeIds).toEqual(expectedBlueprintTypeIds);
  });

  test("new players start with the content-authored hunk count", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);

    expect(player.inventory.getResourceCount(hunkItemId)).toBe(
      getStarterHunkAmount(),
    );
  });

  test("mag crafting requires obtaining the corresponding gun first", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const station = new Hub(runtime.world.allocEntityId());
    station.x = player.x;
    station.y = player.y;
    runtime.world.spawn(station);
    tick(runtime, 1);

    const starterHunks = getStarterHunkAmount();
    player.craft(runtime.world, basicGunMagItemId);
    expect(player.inventory.countType(basicGunMagItemId)).toBe(0);
    expect(player.inventory.getResourceCount(hunkItemId)).toBe(starterHunks);

    expect(
      player.inventory.grantItemCtor(
        requireItemLikeTypeEntry(basicGunItemId).ctor,
        1,
      ),
    ).toBe(true);
    expect(player.inventory.isRecipeUnlocked(basicGunMagItemId)).toBe(true);

    player.craft(runtime.world, basicGunMagItemId);
    expect(player.inventory.countType(basicGunMagItemId)).toBe(1);
    const magRecipeHunkCost =
      getItemContent(basicGunMagItemId)?.recipe?.costs.find(
        (cost) => cost.typeId === hunkItemId,
      )?.amount ?? 0;
    expect(player.inventory.getResourceCount(hunkItemId)).toBe(
      starterHunks - magRecipeHunkCost,
    );
  });

  test("AK mag crafting stays unlocked while the player holds the AK", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const station = new Hub(runtime.world.allocEntityId());
    station.x = player.x;
    station.y = player.y;
    runtime.world.spawn(station);
    tick(runtime, 1);

    const akEntry = requireItemLikeTypeEntry(basicRifleItemId);
    const ak = new akEntry.ctor();
    if (!ak.isWeaponItem()) {
      throw new Error("expected AK item entry to construct a weapon");
    }
    player.inventory.hotbarSlots[0] = {
      kind: "weapon",
      weapon: ak as Weapon,
    };

    const starterHunks = getStarterHunkAmount();
    expect(player.inventory.isRecipeUnlocked(basicRifleMagItemId)).toBe(true);
    player.craft(runtime.world, basicRifleMagItemId);

    expect(player.inventory.countType(basicRifleMagItemId)).toBe(1);
    const magRecipeHunkCost =
      getItemContent(basicRifleMagItemId)?.recipe?.costs.find(
        (cost) => cost.typeId === hunkItemId,
      )?.amount ?? 0;
    expect(player.inventory.getResourceCount(hunkItemId)).toBe(
      starterHunks - magRecipeHunkCost,
    );
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
    const chest = new Hub(runtime.world.allocEntityId());
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
    const chest = new Hub(runtime.world.allocEntityId());
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

  test("destroyed hub stays in world and can be repaired with hunk", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const hub = new Hub(runtime.world.allocEntityId());
    hub.x = player.x + 20;
    hub.y = player.y;
    runtime.world.spawn(hub);

    hub.hp = 0;
    hub.handleDeath(runtime.world);

    expect(runtime.world.entities.has(hub.id)).toBe(true);
    expect(hub.alive).toBe(false);
    expect(hub.hp).toBe(0);

    player.inventory.addStackable(hunkItemId, 20);
    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "repair_tower",
      towerId: hub.id,
    });

    expect(hub.alive).toBe(true);
    expect(hub.hp).toBe(hub.maxHp);
  });

  test("repair_tower consumes hunk and restores tower to full hp", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const tower = new CommsTower(runtime.world.allocEntityId());
    tower.x = player.x + 20;
    tower.y = player.y;
    tower.hp = 100;
    runtime.world.spawn(tower);

    const initialHunks = player.inventory.countType(hunkItemId);
    const expectedCost = Math.ceil(
      (tower.maxHp - tower.hp) / TOWER_REPAIR_HP_PER_COST_UNIT,
    );

    enqueueAction(runtime, {
      t: "action",
      seq: 1,
      action: "repair_tower",
      towerId: tower.id,
    });

    expect(tower.hp).toBe(tower.maxHp);
    expect(tower.alive).toBe(true);
    expect(player.inventory.countType(hunkItemId)).toBe(
      initialHunks - expectedCost,
    );
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

  test("stackable pickups wait for explicit pickup input", () => {
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

    expect(runtime.world.entities.has(pickup.id)).toBe(true);
    expect(player.inventory.countType(hunkItemId)).toBe(before);

    enqueueAction(runtime, { t: "action", seq: 1, action: "pickup" });

    expect(runtime.world.entities.has(pickup.id)).toBe(false);
    expect(player.inventory.countType(hunkItemId)).toBe(before + 3);
  });

  test("medical pickups require pickup action and collect as bandages instead of healing directly", () => {
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
    expect(runtime.world.entities.has(pickup.id)).toBe(true);
    expect(player.hp).toBe(50);
    expect(player.inventory.countType(crudeBandageItemId)).toBe(0);

    enqueueAction(runtime, { t: "action", seq: 1, action: "pickup" });

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

    const bandageHealAmount =
      getItemContent(crudeBandageItemId)?.healing?.amount;
    expect(bandageHealAmount).toBeDefined();
    expect(player.hp).toBe(50 + (bandageHealAmount ?? 0));
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

  test("weapon and building pickups wait for explicit pickup input", () => {
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

  test("recycle near hub grants hunks", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const hub = new Hub(runtime.world.allocEntityId());
    hub.x = player.x + 10;
    hub.y = player.y;
    runtime.world.spawn(hub);
    const wallSlotIndex = addWallAndFindSlot(player);
    player.inventory.setSelectedHotbarIndex(wallSlotIndex);
    const before = player.inventory.getResourceCount(hunkItemId);
    enqueueAction(runtime, { t: "action", seq: 1, action: "recycle" });
    expect(player.inventory.getResourceCount(hunkItemId)).toBeGreaterThan(
      before,
    );
  });

  test("recycle away from hub does nothing", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    for (const entity of runtime.world.entities.all()) {
      if (entity instanceof Hub) {
        runtime.world.despawn(entity.id);
      }
    }
    const hub = new Hub(runtime.world.allocEntityId());
    hub.x = player.x + 2000;
    hub.y = player.y;
    runtime.world.spawn(hub);
    const wallSlotIndex = addWallAndFindSlot(player);
    player.inventory.setSelectedHotbarIndex(wallSlotIndex);
    const before = player.inventory.getResourceCount(hunkItemId);
    enqueueAction(runtime, { t: "action", seq: 1, action: "recycle" });
    expect(player.inventory.getResourceCount(hunkItemId)).toBe(before);
  });
});
