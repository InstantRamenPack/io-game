import { Cannon } from "@server/entities/buildings/Cannon.ts";
import { StructureItem } from "@server/items/resources/StructureItem.ts";

export class CannonItem extends StructureItem {
  public static override readonly resourceName = "cannon";
  public static override readonly buildingTypeId = Cannon.typeId;
}
