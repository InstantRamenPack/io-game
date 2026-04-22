import { getItemContent } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { Item } from "@server/items/Item.ts";

/**
 * Shared runtime base for blueprint items that unlock crafting recipes.
 */
export abstract class BlueprintItem extends Item {
  public getUnlockedRecipeTypeId(): ResourceId {
    const unlockedRecipeTypeId = getItemContent(
      this.typeId,
    )?.unlocksRecipeTypeId;
    if (!unlockedRecipeTypeId) {
      throw new Error(
        `Blueprint ${this.typeId} is missing unlocksRecipeTypeId.`,
      );
    }
    return unlockedRecipeTypeId;
  }
}
