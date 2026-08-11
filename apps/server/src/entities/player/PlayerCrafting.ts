import {
  getItemContent,
  isRecipeBlueprintLocked,
  getWeaponContent,
} from "@shared/content/catalog.ts";
import {
  CRAFTING_STATION_INTERACT_PADDING,
  CHEST_INTERACT_PADDING,
} from "@shared/gameplay/constants.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { CraftTargetInput } from "@shared/net/protocol.ts";
import { isContainerEntity } from "@server/content/serverContentCapabilities.ts";
import { getDebugAdjustedResourceCosts } from "@server/server/debugPlayerBootstrap.ts";
import type { Player } from "@server/entities/Player.ts";
import type { Item } from "@server/items/Item.ts";
import { Weapon } from "@server/items/Weapon.ts";
import { getItemLikeTypeEntry } from "@server/registry/itemLikeRegistry.ts";
import type { ContainerSlot } from "@server/inventory/ContainerSlot.ts";
import type { Hub } from "@server/entities/tower/Hub.ts";
import type { World } from "@server/world/World.ts";
import { getNearbyCraftingStations } from "@server/entities/player/PlayerTowerInteraction.ts";

export type ResolvedCraftTarget =
  | { source: "hotbar"; index: number }
  | { source: "chest"; index: number; chest: Hub };

export function craft(
  player: Player,
  world: World,
  itemTypeId: ResourceId,
  target?: CraftTargetInput,
): void {
  const nearbyCraftingStations = getNearbyCraftingStations(player, world);
  const nearCraftingStation = nearbyCraftingStations.some((station) => {
    if (!station.alive) {
      return false;
    }
    const bounds = station.getWorldBounds();
    return (
      player.x >= bounds.minX - CRAFTING_STATION_INTERACT_PADDING &&
      player.x <= bounds.maxX + CRAFTING_STATION_INTERACT_PADDING &&
      player.y >= bounds.minY - CRAFTING_STATION_INTERACT_PADDING &&
      player.y <= bounds.maxY + CRAFTING_STATION_INTERACT_PADDING
    );
  });
  if (!nearCraftingStation) {
    return;
  }

  const outputEntry = getItemLikeTypeEntry(itemTypeId);
  const recipe = outputEntry?.content.recipe;
  if (!outputEntry || !recipe) {
    return;
  }

  if (
    (isRecipeBlueprintLocked(itemTypeId) || itemTypeId.startsWith("mag:")) &&
    !player.inventory.isRecipeUnlocked(itemTypeId)
  ) {
    return;
  }

  const craftCosts = getDebugAdjustedResourceCosts(player, recipe.costs);
  if (!player.inventory.hasTypes(craftCosts)) {
    return;
  }

  const outputItem = new outputEntry.ctor();
  const craftTarget = resolveCraftTarget(player, world, target);
  const canStoreTargetedCraftOutput =
    craftTarget !== null &&
    canStoreCraftOutputInTarget(
      player,
      outputItem,
      recipe.outputAmount,
      craftTarget,
    );
  const canStoreCraftOutput = outputItem.canGrantToInventoryAfterConsuming(
    player.inventory,
    recipe.outputAmount,
    craftCosts,
  );
  if (!canStoreCraftOutput && !canStoreTargetedCraftOutput) {
    return;
  }

  player.inventory.consumeTypes(craftCosts);
  const grantedToTarget =
    canStoreTargetedCraftOutput &&
    craftTarget !== null &&
    grantCraftOutputToTarget(
      player,
      outputItem,
      recipe.outputAmount,
      craftTarget,
    );
  if (!grantedToTarget) {
    outputItem.grantToInventory(player.inventory, recipe.outputAmount);
  }
}

function resolveCraftTarget(
  player: Player,
  world: World,
  target?: CraftTargetInput,
): ResolvedCraftTarget | null {
  if (!target) {
    return null;
  }
  if (
    target.source === "hotbar" &&
    target.index >= 0 &&
    target.index < player.inventory.hotbarSlots.length
  ) {
    return { source: "hotbar", index: target.index };
  }
  if (target.source !== "chest" || target.chestEntityId === undefined) {
    return null;
  }
  const chestEntity = world.entities.get(target.chestEntityId);
  if (!chestEntity || !isContainerEntity(chestEntity) || !chestEntity.alive) {
    return null;
  }
  if (target.index < 0 || target.index >= chestEntity.chestSlots.length) {
    return null;
  }

  const bounds = chestEntity.getWorldBounds();
  if (
    player.x < bounds.minX - CHEST_INTERACT_PADDING ||
    player.x > bounds.maxX + CHEST_INTERACT_PADDING ||
    player.y < bounds.minY - CHEST_INTERACT_PADDING ||
    player.y > bounds.maxY + CHEST_INTERACT_PADDING
  ) {
    return null;
  }
  return { source: "chest", index: target.index, chest: chestEntity };
}

function canStoreCraftOutputInTarget(
  player: Player,
  outputItem: Item,
  amount: number,
  target: ResolvedCraftTarget,
): boolean {
  if (amount <= 0) {
    return true;
  }
  const currentSlot = getCraftTargetSlot(player, target);
  if (outputItem.isWeaponItem()) {
    return amount === 1 && currentSlot === null;
  }
  if (!isHotbarStoredCraftOutput(outputItem.typeId)) {
    return false;
  }
  return (
    currentSlot === null ||
    (currentSlot.kind === "buildable" &&
      currentSlot.typeId === outputItem.typeId)
  );
}

function grantCraftOutputToTarget(
  player: Player,
  outputItem: Item,
  amount: number,
  target: ResolvedCraftTarget,
): boolean {
  if (!canStoreCraftOutputInTarget(player, outputItem, amount, target)) {
    return false;
  }
  if (amount <= 0) {
    return true;
  }
  if (outputItem.isWeaponItem()) {
    writeCraftTargetSlot(player, target, {
      kind: "weapon",
      typeId: outputItem.typeId,
    });
    return true;
  }

  const currentSlot = getCraftTargetSlot(player, target);
  writeCraftTargetSlot(player, target, {
    kind: "buildable",
    typeId: outputItem.typeId,
    count:
      currentSlot?.kind === "buildable" &&
      currentSlot.typeId === outputItem.typeId
        ? currentSlot.count + amount
        : amount,
  });
  return true;
}

function getCraftTargetSlot(
  player: Player,
  target: ResolvedCraftTarget,
): ContainerSlot {
  if (target.source === "chest") {
    return target.chest.getSlot(target.index);
  }
  const slot = player.inventory.hotbarSlots[target.index] ?? null;
  if (slot === null) {
    return null;
  }
  return slot.kind === "buildable"
    ? { kind: "buildable", typeId: slot.typeId, count: slot.count }
    : { kind: "weapon", typeId: slot.weapon.typeId };
}

function writeCraftTargetSlot(
  player: Player,
  target: ResolvedCraftTarget,
  value: Exclude<ContainerSlot, null>,
): void {
  if (target.source === "chest") {
    target.chest.setSlot(target.index, value);
    return;
  }
  if (value.kind === "buildable") {
    player.inventory.hotbarSlots[target.index] = {
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
    player.inventory.hotbarSlots[target.index] = {
      kind: "weapon",
      weapon: new entry.ctor() as Weapon,
    };
  }
}

function isHotbarStoredCraftOutput(typeId: ResourceId): boolean {
  const content = getItemContent(typeId);
  return Boolean(
    content?.buildsEntityTypeId || content?.consumable || content?.armor,
  );
}
