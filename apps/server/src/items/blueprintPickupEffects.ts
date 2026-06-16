import {
  getBlueprintUnlockedRecipeTypeIds,
  getItemContent,
} from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

// Ordered chain of armor blueprint recipe IDs from lowest to highest tier.
// When any armor blueprint is picked up, the player receives the lowest tier
// not yet unlocked in the session, preventing skipped prerequisites.
const ARMOR_BLUEPRINT_RECIPE_CHAIN: readonly ResourceId[] = [
  "item:armor_t2" as ResourceId,
  "item:armor_t3" as ResourceId,
  "item:armor_t4" as ResourceId,
];

const ARMOR_BLUEPRINT_RECIPE_SET = new Set<ResourceId>(
  ARMOR_BLUEPRINT_RECIPE_CHAIN,
);

export function isBlueprintPickup(pickup: ItemEntity): boolean {
  for (const [typeId, amount] of pickup.contents.resources.entries()) {
    if (amount > 0 && getBlueprintUnlockedRecipeTypeIds(typeId).length > 0) {
      return true;
    }
  }

  for (const slot of pickup.contents.hotbarSlots) {
    if (
      slot &&
      slot.kind !== "weapon" &&
      slot.count > 0 &&
      getBlueprintUnlockedRecipeTypeIds(slot.typeId).length > 0
    ) {
      return true;
    }
  }

  return false;
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
  const rawRecipeTypeIds = getBlueprintPickupRecipeTypeIds(pickup);
  if (rawRecipeTypeIds.size === 0) {
    return;
  }

  // Resolve armor blueprints to the next unlocked tier; pass others through.
  const effectiveRecipeTypeIds = new Set<ResourceId>();
  for (const recipeTypeId of rawRecipeTypeIds) {
    if (ARMOR_BLUEPRINT_RECIPE_SET.has(recipeTypeId)) {
      const nextTier = ARMOR_BLUEPRINT_RECIPE_CHAIN.find(
        (tier) => !world.isRecipeSessionUnlocked(tier),
      );
      if (nextTier !== undefined) {
        effectiveRecipeTypeIds.add(nextTier);
      }
    } else {
      effectiveRecipeTypeIds.add(recipeTypeId);
    }
  }

  if (effectiveRecipeTypeIds.size === 0) {
    return;
  }

  for (const recipeTypeId of effectiveRecipeTypeIds) {
    world.recordSessionRecipeUnlock(recipeTypeId);
    for (const player of world.entities.queryInstances(Player)) {
      player.inventory.unlockRecipe(recipeTypeId);
    }
  }

  const label = resolveEffectiveBlueprintLabel(pickup, effectiveRecipeTypeIds);
  world.broadcastSystemMessage(
    `${collector.name} found a ${label}! Recipe unlocked for all players.`,
  );
}

function resolveEffectiveBlueprintLabel(
  pickup: ItemEntity,
  effectiveRecipeTypeIds: Set<ResourceId>,
): string {
  for (const tier of ARMOR_BLUEPRINT_RECIPE_CHAIN) {
    if (effectiveRecipeTypeIds.has(tier)) {
      const armorLabel = getItemContent(tier)?.label;
      if (armorLabel) {
        return `Blueprint: ${armorLabel}`;
      }
    }
  }
  return getBlueprintPickupLabel(pickup);
}

function getBlueprintPickupRecipeTypeIds(pickup: ItemEntity): Set<ResourceId> {
  const unlockedRecipeTypeIds = new Set<ResourceId>(
    pickup.contents.getUnlockedRecipeTypeIds(),
  );

  for (const [typeId, amount] of pickup.contents.resources.entries()) {
    if (amount <= 0) {
      continue;
    }
    for (const unlockedRecipeTypeId of getBlueprintUnlockedRecipeTypeIds(
      typeId,
    )) {
      unlockedRecipeTypeIds.add(unlockedRecipeTypeId);
    }
  }

  for (const slot of pickup.contents.hotbarSlots) {
    if (!slot || slot.kind === "weapon" || slot.count <= 0) {
      continue;
    }
    for (const unlockedRecipeTypeId of getBlueprintUnlockedRecipeTypeIds(
      slot.typeId,
    )) {
      unlockedRecipeTypeIds.add(unlockedRecipeTypeId);
    }
  }

  return unlockedRecipeTypeIds;
}
