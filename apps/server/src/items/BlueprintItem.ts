import { getItemContent } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { Item } from "@server/items/Item.ts";
import type { Inventory } from "@server/items/Inventory.ts";

/**
 * Shared runtime base for blueprint items that unlock crafting recipes.
 */
export abstract class BlueprintItem extends Item {
  public override isStoredOnInventoryAcquisition(): boolean {
    return false;
  }

  public override canGrantToInventory(
    _targetInventory: Inventory,
    _amount: number,
  ): boolean {
    return true;
  }

  public override grantToInventory(
    targetInventory: Inventory,
    amount: number,
  ): boolean {
    if (amount <= 0) {
      return true;
    }
    targetInventory.unlockRecipe(this.getUnlockedRecipeTypeId());
    return true;
  }

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
