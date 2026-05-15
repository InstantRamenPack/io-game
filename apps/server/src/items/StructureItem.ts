import { Item } from "@server/items/Item.ts";

/**
 * Base class for buildable inventory items that place structures in-world.
 */
export abstract class StructureItem extends Item {
  public override requiresManualPickup(): boolean {
    return true;
  }
}
