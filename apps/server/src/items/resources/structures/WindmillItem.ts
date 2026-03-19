import { Windmill } from "@server/entities/buildings/Windmill.ts";
import { StructureItem } from "@server/items/resources/StructureItem.ts";

export class WindmillItem extends StructureItem {
  public static readonly typeId = "item:windmill" as const;

  public constructor(id: number) {
    super(id, WindmillItem.typeId, Windmill.typeId);
  }
}
