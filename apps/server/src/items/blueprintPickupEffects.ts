import { getItemContent } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import { WORLD_BLUEPRINT_PICKUP_TYPE_IDS } from "@server/content/serverContentCapabilities.ts";
import type { World } from "@server/world/World.ts";

export function isBlueprintPickup(pickup: ItemEntity): boolean {
  return WORLD_BLUEPRINT_PICKUP_TYPE_IDS.some(
    (typeId) => pickup.contents.getStackableCount(typeId) > 0,
  );
}

export function getBlueprintPickupLabel(pickup: ItemEntity): string {
  for (const [typeId, amount] of pickup.contents.resources.entries()) {
    if (amount > 0) {
      const label = getItemContent(typeId)?.label;
      if (label) {
        return label;
      }
    }
  }
  return "Blueprint";
}

export function applyBlueprintPickupWorldEffects(
  world: World,
  pickup: ItemEntity,
  collector: Player,
): void {
  const unlockedRecipeTypeIds = getBlueprintPickupRecipeTypeIds(pickup);
  if (unlockedRecipeTypeIds.size === 0) {
    return;
  }

  for (const player of world.entities.queryInstances(Player)) {
    for (const unlockedRecipeTypeId of unlockedRecipeTypeIds) {
      player.inventory.unlockRecipe(unlockedRecipeTypeId);
    }
  }

  const label = getBlueprintPickupLabel(pickup);
  world.broadcastSystemMessage(
    `${collector.name} found a ${label}! Recipe unlocked for all players.`,
  );
}

function getBlueprintPickupRecipeTypeIds(pickup: ItemEntity): Set<ResourceId> {
  const unlockedRecipeTypeIds = new Set<ResourceId>(
    pickup.contents.getUnlockedRecipeTypeIds(),
  );

  for (const [typeId, amount] of pickup.contents.resources.entries()) {
    if (amount <= 0) {
      continue;
    }
    const unlockedRecipeTypeId = getItemContent(typeId)?.unlocksRecipeTypeId;
    if (unlockedRecipeTypeId) {
      unlockedRecipeTypeIds.add(unlockedRecipeTypeId);
    }
  }

  for (const slot of pickup.contents.hotbarSlots) {
    if (!slot || slot.kind === "weapon" || slot.count <= 0) {
      continue;
    }
    const unlockedRecipeTypeId = getItemContent(
      slot.typeId,
    )?.unlocksRecipeTypeId;
    if (unlockedRecipeTypeId) {
      unlockedRecipeTypeIds.add(unlockedRecipeTypeId);
    }
  }

  return unlockedRecipeTypeIds;
}
