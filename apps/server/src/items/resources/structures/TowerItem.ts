import { Tower } from "@server/entities/buildings/Tower.ts";
import { StructureItem } from "@server/items/resources/StructureItem.ts";

export class TowerItem extends StructureItem {
  public static override readonly resourceName = "tower";
  public static override readonly buildingTypeId = Tower.typeId;

  public constructor(id: number) {
    super(id);
  }
}
