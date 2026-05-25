import { Item } from "@server/items/Item.ts";

export abstract class ArmorItem extends Item {
  public override requiresManualPickup(): boolean {
    return true;
  }
}
