import { getBlueprintUnlockedRecipeTypeIds } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import { Item } from "@server/items/Item.ts";
import type { Inventory } from "@server/items/Inventory.ts";

/**
 * Shared runtime base for blueprint items that unlock crafting recipes.
 */
export abstract class BlueprintItem extends Item {
  public static override readonly kind = "blueprint" as const;

  public override isStoredOnInventoryAcquisition(): boolean {
    return false;
  }

  public override requiresManualPickup(): boolean {
    return true;
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
    for (const recipeTypeId of this.getUnlockedRecipeTypeIds()) {
      targetInventory.unlockRecipe(recipeTypeId);
    }
    return true;
  }

  public getUnlockedRecipeTypeIds(): readonly ResourceId[] {
    const unlockedRecipeTypeIds = getBlueprintUnlockedRecipeTypeIds(
      this.typeId,
    );
    if (unlockedRecipeTypeIds.length === 0) {
      throw new Error(
        `Blueprint ${this.typeId} is missing unlock recipe type ids.`,
      );
    }
    return unlockedRecipeTypeIds;
  }
}
