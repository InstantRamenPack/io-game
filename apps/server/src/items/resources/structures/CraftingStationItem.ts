import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { StructureItem } from "@server/items/resources/StructureItem.ts";

export class CraftingStationItem extends StructureItem {
  public static readonly typeId = "item:crafting_station" as const;

  public constructor(id: number) {
    super(id, CraftingStationItem.typeId, CraftingStation.typeId);
  }
}
