import { Wall } from "@server/entities/buildings/Wall.ts";
import { StructureItem } from "@server/items/resources/StructureItem.ts";

export class WallItem extends StructureItem {
  public static override readonly resourceName = "wall";
  public static override readonly buildingTypeId = Wall.typeId;

  public constructor(id: number) {
    super(id);
  }
}
