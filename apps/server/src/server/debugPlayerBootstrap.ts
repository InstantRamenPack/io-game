import {
  getBlueprintLockedRecipeTypeIds,
} from "@shared/content/catalog.ts";
import type { ItemRequirement } from "@shared/content/schema.ts";
import { HUNK_ITEM_TYPE_ID } from "@server/content/serverContentCapabilities.ts";
import type { Player } from "@server/entities/Player.ts";

const DEBUG_STARTER_HUNK_AMOUNT = 999_999;

export function applyDebugPlayerBootstrap(player: Player): void {
  if (!player.isDebugSpectatorMode()) {
    return;
  }

  for (const recipeTypeId of getBlueprintLockedRecipeTypeIds()) {
    player.inventory.unlockRecipe(recipeTypeId);
  }

  const currentHunks = player.inventory.getResourceCount(HUNK_ITEM_TYPE_ID);
  if (currentHunks < DEBUG_STARTER_HUNK_AMOUNT) {
    player.inventory.addStackable(
      HUNK_ITEM_TYPE_ID,
      DEBUG_STARTER_HUNK_AMOUNT - currentHunks,
    );
  }
}

export function getDebugAdjustedResourceCosts(
  player: Player,
  requirements: readonly ItemRequirement[],
): ItemRequirement[] {
  if (!player.isDebugSpectatorMode()) {
    return [...requirements];
  }

  return requirements.filter(
    (requirement) => requirement.typeId !== HUNK_ITEM_TYPE_ID,
  );
}
