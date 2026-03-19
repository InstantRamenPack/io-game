import { ResourceItem } from "@server/items/resources/ResourceItem.ts";

export class FoodItem extends ResourceItem {
  public static readonly typeId = "item:food" as const;

  public constructor(id: number) {
    super(id, FoodItem.typeId);
  }
}
