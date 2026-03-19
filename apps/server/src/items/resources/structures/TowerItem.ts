import { Tower } from "@server/entities/buildings/Tower.ts";
import { StructureItem } from "@server/items/resources/StructureItem.ts";

export class TowerItem extends StructureItem {
  public static readonly typeId = "item:tower" as const;

  public constructor(id: number) {
    super(id, TowerItem.typeId, Tower.typeId);
  }
}
