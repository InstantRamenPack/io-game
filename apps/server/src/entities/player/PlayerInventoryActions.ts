import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import {
  CHEST_INTERACT_PADDING,
  CHEST_SLOT_COUNT,
  HOTBAR_SLOT_COUNT,
} from "@shared/gameplay/constants.ts";
import { getArmorStats } from "@shared/gameplay/rules/armorRules.ts";
import { getWeaponContent } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  getRecycleHunkOutput,
  HUNK_ITEM_TYPE_ID,
  isContainerEntity,
} from "@server/content/serverContentCapabilities.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import type { Player } from "@server/entities/Player.ts";
import {
  applyBlueprintPickupWorldEffects,
  isBlueprintPickup,
} from "@server/items/blueprintPickupEffects.ts";
import { ConsumableItem } from "@server/items/ConsumableItem.ts";
import { ArmorItem } from "@server/items/armor/ArmorItem.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { Weapon } from "@server/items/Weapon.ts";
import { getItemLikeTypeEntry } from "@server/registry/itemLikeRegistry.ts";
import type { ContainerSlot } from "@server/inventory/ContainerSlot.ts";
import type { Hub } from "@server/entities/tower/Hub.ts";
import type { World } from "@server/world/World.ts";
import { isNearRecycler } from "@server/entities/player/PlayerTowerInteraction.ts";

export function dropSelectedItem(
  player: Player,
  world: World,
  dropWholeStack: boolean,
): void {
  const selectedHotbarIndex = player.inventory.selectedHotbarIndex;
  const selectedSlot = player.inventory.hotbarSlots[selectedHotbarIndex];
  if (!selectedSlot && !player.getEquippedArmorTypeId()) {
    return;
  }

  const droppedInventory = new Inventory();
  if (!selectedSlot) {
    droppedInventory.addStackable(
      player.getEquippedArmorTypeId() as ResourceId,
      1,
    );
    player.setEquippedArmorTypeId(undefined);
  } else if (selectedSlot.kind === "weapon") {
    player.inventory.hotbarSlots[selectedHotbarIndex] = null;
    droppedInventory.addWeapon(selectedSlot.weapon);
  } else {
    const dropCount = dropWholeStack ? selectedSlot.count : 1;
    if (dropCount <= 0) {
      return;
    }
    selectedSlot.count -= dropCount;
    if (selectedSlot.count <= 0) {
      player.inventory.hotbarSlots[selectedHotbarIndex] = null;
    }
    droppedInventory.addStackable(selectedSlot.typeId, dropCount);
  }

  spawnDroppedInventory(player, world, droppedInventory);
}

export function spawnDroppedInventory(
  player: Player,
  world: World,
  droppedInventory: Inventory,
): void {
  const pickup = new ItemEntity(world.allocEntityId(), droppedInventory);
  const dropDistance = 20;
  const aimX = Math.cos(player.rotation);
  const aimY = Math.sin(player.rotation);
  const directionX = Number.isFinite(aimX) ? aimX : 1;
  const directionY = Number.isFinite(aimY) ? aimY : 0;
  pickup.x = player.x + directionX * dropDistance;
  pickup.y = player.y + directionY * dropDistance;

  const bounds = pickup.getWorldBounds();
  if (bounds.minX < 0) {
    pickup.x -= bounds.minX;
  }
  if (bounds.maxX > world.gameConfig.worldSize.w) {
    pickup.x -= bounds.maxX - world.gameConfig.worldSize.w;
  }
  if (bounds.minY < 0) {
    pickup.y -= bounds.minY;
  }
  if (bounds.maxY > world.gameConfig.worldSize.h) {
    pickup.y -= bounds.maxY - world.gameConfig.worldSize.h;
  }

  world.spawn(pickup);
}

export function pickupNearestOverlappingItem(
  player: Player,
  world: World,
): void {
  const bounds = player.getWorldBounds();
  const playerHitboxes = player.getWorldHitboxes();
  let nearestPickup: ItemEntity | undefined;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const candidate of world.spatial.queryBox(
    bounds.minX,
    bounds.minY,
    bounds.maxX,
    bounds.maxY,
  )) {
    if (!(candidate instanceof ItemEntity)) {
      continue;
    }
    if (
      !doResolvedRectSetsOverlap(playerHitboxes, candidate.getWorldHitboxes())
    ) {
      continue;
    }
    const distanceSquared =
      (candidate.x - player.x) * (candidate.x - player.x) +
      (candidate.y - player.y) * (candidate.y - player.y);
    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearestPickup = candidate;
    }
  }

  if (!nearestPickup) {
    return;
  }

  if (
    !player.inventory.absorbInventoryByAcquisitionRules(nearestPickup.contents)
  ) {
    return;
  }

  if (isBlueprintPickup(nearestPickup)) {
    applyBlueprintPickupWorldEffects(world, nearestPickup, player);
  }

  world.despawn(nearestPickup.id);
}

export function recycleSelectedItem(player: Player, world: World): void {
  if (!isNearRecycler(player, world)) {
    return;
  }

  const selectedIndex = player.inventory.selectedHotbarIndex;
  const slot = player.inventory.hotbarSlots[selectedIndex];
  if (!slot) {
    return;
  }

  const typeId = slot.kind === "weapon" ? slot.weapon.typeId : slot.typeId;
  const hunkAmount = getRecycleHunkOutput(typeId, world.randomNumberGenerator);
  if (hunkAmount === undefined || hunkAmount <= 0) {
    return;
  }

  if (slot.kind === "weapon") {
    player.inventory.hotbarSlots[selectedIndex] = null;
  } else {
    slot.count -= 1;
    if (slot.count <= 0) {
      player.inventory.hotbarSlots[selectedIndex] = null;
    }
  }

  player.inventory.addStackable(HUNK_ITEM_TYPE_ID, hunkAmount);
}

export function useConsumable(
  player: Player,
  world: World,
  typeId: ResourceId,
): void {
  const selectedIndex = player.inventory.selectedHotbarIndex;
  const selectedSlot = player.inventory.hotbarSlots[selectedIndex];
  if (
    !selectedSlot ||
    selectedSlot.kind !== "buildable" ||
    selectedSlot.typeId !== typeId ||
    selectedSlot.count <= 0
  ) {
    return;
  }
  const itemEntry = getItemLikeTypeEntry(typeId);
  if (!itemEntry) {
    return;
  }
  const item = new itemEntry.ctor();
  if (item instanceof ArmorItem) {
    if (player.getEquippedArmorTypeId()) {
      selectedSlot.typeId = player.getEquippedArmorTypeId() as ResourceId;
      selectedSlot.count = 1;
    } else {
      selectedSlot.count -= 1;
      if (selectedSlot.count <= 0) {
        player.inventory.hotbarSlots[selectedIndex] = null;
      }
    }
    player.setEquippedArmorTypeId(typeId);
    return;
  }
  if (!(item instanceof ConsumableItem)) {
    return;
  }
  selectedSlot.count -= 1;
  if (selectedSlot.count <= 0) {
    player.inventory.hotbarSlots[selectedIndex] = null;
  }
  item.consume(world, player);
}

export function applyChestMove(
  player: Player,
  world: World,
  action: {
    chestEntityId: number;
    fromSource: "hotbar" | "chest";
    fromIndex: number;
    toSource: "hotbar" | "chest";
    toIndex: number;
  },
): void {
  const { chestEntityId, fromSource, fromIndex, toSource, toIndex } = action;

  const maxHotbar = HOTBAR_SLOT_COUNT - 1;
  if (fromSource === "hotbar" && (fromIndex < 0 || fromIndex > maxHotbar)) {
    return;
  }
  if (
    fromSource === "chest" &&
    (fromIndex < 0 || fromIndex >= CHEST_SLOT_COUNT)
  ) {
    return;
  }
  if (toSource === "hotbar" && (toIndex < 0 || toIndex > maxHotbar)) {
    return;
  }
  if (toSource === "chest" && (toIndex < 0 || toIndex >= CHEST_SLOT_COUNT)) {
    return;
  }

  const chestEntity = world.entities.get(chestEntityId);
  if (!chestEntity || !isContainerEntity(chestEntity)) {
    return;
  }
  if (!chestEntity.alive) {
    return;
  }

  const bounds = chestEntity.getWorldBounds();
  if (
    player.x < bounds.minX - CHEST_INTERACT_PADDING ||
    player.x > bounds.maxX + CHEST_INTERACT_PADDING ||
    player.y < bounds.minY - CHEST_INTERACT_PADDING ||
    player.y > bounds.maxY + CHEST_INTERACT_PADDING
  ) {
    return;
  }

  const fromValue = extractSlotValue(player, fromSource, fromIndex, chestEntity);
  if (fromValue === null) {
    return;
  }
  const toValue = extractSlotValue(player, toSource, toIndex, chestEntity);

  if (
    fromValue.kind === "buildable" &&
    toValue?.kind === "buildable" &&
    fromValue.typeId === toValue.typeId
  ) {
    const stacked = fromValue.count + toValue.count;
    writeSlotValue(player, toSource, toIndex, chestEntity, {
      kind: "buildable",
      typeId: toValue.typeId,
      count: stacked,
    });
    writeSlotValue(player, fromSource, fromIndex, chestEntity, null);
    return;
  }

  writeSlotValue(player, toSource, toIndex, chestEntity, fromValue);
  writeSlotValue(player, fromSource, fromIndex, chestEntity, toValue);
}

export function applyArmorMove(
  player: Player,
  action: {
    fromSource: "hotbar" | "armor";
    fromIndex: number;
    toSource: "hotbar" | "armor";
    toIndex: number;
  },
): void {
  if (action.fromSource === action.toSource) {
    return;
  }
  if (action.fromSource === "hotbar" && action.toSource === "armor") {
    moveHotbarToArmor(player, action.fromIndex, action.toIndex);
    return;
  }
  moveArmorToHotbar(player, action.fromIndex, action.toIndex);
}

function moveHotbarToArmor(
  player: Player,
  fromHotbarIndex: number,
  toArmorIndex: number,
): void {
  if (toArmorIndex !== 0) {
    return;
  }
  const selectedSlot = player.inventory.hotbarSlots[fromHotbarIndex];
  if (
    !selectedSlot ||
    selectedSlot.kind !== "buildable" ||
    selectedSlot.count <= 0
  ) {
    return;
  }
  if (!getArmorStats(selectedSlot.typeId)) {
    return;
  }

  const incomingArmorTypeId = selectedSlot.typeId;
  selectedSlot.count -= 1;
  if (selectedSlot.count <= 0) {
    player.inventory.hotbarSlots[fromHotbarIndex] = null;
  }

  if (player.getEquippedArmorTypeId()) {
    const currentArmorTypeId = player.getEquippedArmorTypeId() as ResourceId;
    if (
      selectedSlot &&
      selectedSlot.kind === "buildable" &&
      selectedSlot.typeId === currentArmorTypeId
    ) {
      selectedSlot.count += 1;
    } else if (player.inventory.hotbarSlots[fromHotbarIndex] === null) {
      player.inventory.hotbarSlots[fromHotbarIndex] = {
        kind: "buildable",
        typeId: currentArmorTypeId,
        count: 1,
      };
    } else if (!player.inventory.canAddStackable(currentArmorTypeId, 1)) {
      selectedSlot.count += 1;
      if (player.inventory.hotbarSlots[fromHotbarIndex] === null) {
        player.inventory.hotbarSlots[fromHotbarIndex] = selectedSlot;
      }
      return;
    } else {
      player.inventory.addStackable(currentArmorTypeId, 1);
    }
  }

  player.setEquippedArmorTypeId(incomingArmorTypeId);
}

function moveArmorToHotbar(
  player: Player,
  fromArmorIndex: number,
  toHotbarIndex: number,
): void {
  if (fromArmorIndex !== 0 || !player.getEquippedArmorTypeId()) {
    return;
  }
  const slot = player.inventory.hotbarSlots[toHotbarIndex];
  if (!slot) {
    player.inventory.hotbarSlots[toHotbarIndex] = {
      kind: "buildable",
      typeId: player.getEquippedArmorTypeId() as ResourceId,
      count: 1,
    };
    player.setEquippedArmorTypeId(undefined);
    return;
  }
  if (slot.kind === "buildable" && getArmorStats(slot.typeId)) {
    const temp = slot.typeId;
    slot.typeId = player.getEquippedArmorTypeId() as ResourceId;
    player.setEquippedArmorTypeId(temp);
    return;
  }
  const emptyIndex = player.inventory.hotbarSlots.findIndex((s) => s === null);
  if (emptyIndex === -1) {
    return;
  }
  player.inventory.hotbarSlots[emptyIndex] = {
    kind: "buildable",
    typeId: player.getEquippedArmorTypeId() as ResourceId,
    count: 1,
  };
  player.setEquippedArmorTypeId(undefined);
}

export function extractSlotValue(
  player: Player,
  source: "hotbar" | "chest",
  index: number,
  chest: Hub,
): ContainerSlot {
  if (source === "chest") {
    return chest.getSlot(index);
  }
  const slot = player.inventory.hotbarSlots[index] ?? null;
  if (!slot) {
    return null;
  }
  if (slot.kind === "buildable") {
    return { kind: "buildable", typeId: slot.typeId, count: slot.count };
  }
  return { kind: "weapon", typeId: slot.weapon.typeId };
}

export function writeSlotValue(
  player: Player,
  source: "hotbar" | "chest",
  index: number,
  chest: Hub,
  value: ContainerSlot,
): void {
  if (source === "chest") {
    chest.setSlot(index, value);
    return;
  }
  if (value === null) {
    player.inventory.hotbarSlots[index] = null;
    return;
  }
  if (value.kind === "buildable") {
    player.inventory.hotbarSlots[index] = {
      kind: "buildable",
      typeId: value.typeId,
      count: value.count,
    };
    return;
  }
  const entry = getItemLikeTypeEntry(value.typeId);
  if (
    entry &&
    getWeaponContent(value.typeId) &&
    entry.ctor.prototype instanceof Weapon
  ) {
    player.inventory.hotbarSlots[index] = {
      kind: "weapon",
      weapon: new entry.ctor() as Weapon,
    };
  }
}
