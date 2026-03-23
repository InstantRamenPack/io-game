import { Windmill } from "@server/entities/buildings/Windmill.ts";
import { StructureItem } from "@server/items/resources/StructureItem.ts";

export class WindmillItem extends StructureItem {
  public static override readonly resourceName = "windmill";
  public static override readonly buildingTypeId = Windmill.typeId;
}
