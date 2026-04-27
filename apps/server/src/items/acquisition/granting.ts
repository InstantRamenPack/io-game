import { getBlueprintUnlockedRecipeTypeId } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { isWeaponCtor } from "@server/runtime/ctorGuards.ts";
import type { ItemTypeEntry } from "@server/registry/registries.ts";

function getBlueprintUnlock(typeId: ResourceId): ResourceId | undefined {
  return getBlueprintUnlockedRecipeTypeId(typeId);
}

function collectInventoryBlueprintUnlocks(
  inventory: Inventory,
): readonly ResourceId[] {
  const unlocks = new Set<ResourceId>();

  for (const [typeId] of inventory.resources.entries()) {
    const unlockedRecipeTypeId = getBlueprintUnlock(typeId);
    if (unlockedRecipeTypeId) {
      unlocks.add(unlockedRecipeTypeId);
    }
  }

  for (const slot of inventory.hotbarSlots) {
    if (!slot) {
      continue;
    }
    const slotTypeId =
      slot.kind === "weapon" ? slot.weapon.typeId : slot.typeId;
    const unlockedRecipeTypeId = getBlueprintUnlock(slotTypeId);
    if (unlockedRecipeTypeId) {
      unlocks.add(unlockedRecipeTypeId);
    }
  }

  return [...unlocks];
}

function stripBlueprintItems(source: Inventory): Inventory {
  const transferable = new Inventory();
  for (const [typeId, amount] of source.resources.entries()) {
    if (getBlueprintUnlock(typeId)) {
      continue;
    }
    transferable.addStackable(typeId, amount);
  }

  for (const slot of source.hotbarSlots) {
    if (!slot) {
      continue;
    }
    if (slot.kind === "weapon") {
      if (getBlueprintUnlock(slot.weapon.typeId)) {
        continue;
      }
      transferable.addWeapon(slot.weapon);
      continue;
    }
    if (getBlueprintUnlock(slot.typeId)) {
      continue;
    }
    transferable.addStackable(slot.typeId, slot.count);
  }

  for (const unlockedRecipeTypeId of source.getUnlockedRecipeTypeIds()) {
    transferable.unlockRecipe(unlockedRecipeTypeId);
  }

  return transferable;
}

/**
 * Applies shared acquisition rules for inventory-to-inventory transfers.
 * Blueprint items unlock recipes but are not stored as inventory resources.
 */
export function absorbInventoryByAcquisitionRules(
  targetInventory: Inventory,
  sourceInventory: Inventory,
): boolean {
  const transferable = stripBlueprintItems(sourceInventory);
  if (!targetInventory.canAbsorbInventory(transferable)) {
    return false;
  }
  if (!targetInventory.absorbInventory(transferable)) {
    return false;
  }
  for (const unlockedRecipeTypeId of collectInventoryBlueprintUnlocks(
    sourceInventory,
  )) {
    targetInventory.unlockRecipe(unlockedRecipeTypeId);
  }
  return true;
}

/**
 * Grants an item entry to an inventory using the same rules as live pickups.
 * Blueprint item grants unlock recipes and do not add a tangible item stack.
 */
export function grantItemEntryByAcquisitionRules(
  targetInventory: Inventory,
  itemEntry: ItemTypeEntry,
  amount: number,
): boolean {
  if (amount <= 0) {
    return true;
  }

  const unlockedRecipeTypeId = getBlueprintUnlock(itemEntry.typeId);
  if (unlockedRecipeTypeId) {
    targetInventory.unlockRecipe(unlockedRecipeTypeId);
    return true;
  }

  if (isWeaponCtor(itemEntry.ctor)) {
    if (!targetInventory.canAddWeaponCount(amount)) {
      return false;
    }
    for (let index = 0; index < amount; index += 1) {
      targetInventory.addWeapon(new itemEntry.ctor());
    }
    return true;
  }

  if (!targetInventory.canAddStackable(itemEntry.typeId, amount)) {
    return false;
  }
  return targetInventory.addStackable(itemEntry.typeId, amount);
}
