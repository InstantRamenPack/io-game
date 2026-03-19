import { ResourceItem } from "@server/items/resources/ResourceItem.ts";

export class WoodItem extends ResourceItem {
  public static readonly typeId = "item:wood" as const;

  public constructor(id: number) {
    super(id, WoodItem.typeId);
  }
}
