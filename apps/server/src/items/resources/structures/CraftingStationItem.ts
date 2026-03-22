import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { StructureItem } from "@server/items/resources/StructureItem.ts";

export class CraftingStationItem extends StructureItem {
  public static override readonly resourceName = "crafting_station";
  public static override readonly buildingTypeId = CraftingStation.typeId;

  public constructor(id: number) {
    super(id);
  }
}
