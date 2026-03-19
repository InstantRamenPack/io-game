import { Wall } from "@server/entities/buildings/Wall.ts";
import { StructureItem } from "@server/items/resources/StructureItem.ts";

export class WallItem extends StructureItem {
  public static readonly typeId = "item:wall" as const;

  public constructor(id: number) {
    super(id, WallItem.typeId, Wall.typeId);
  }
}
