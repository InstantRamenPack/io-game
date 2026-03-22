import { ResourceItem } from "@server/items/resources/ResourceItem.ts";

export class FoodItem extends ResourceItem {
  public static override readonly resourceName = "food";
  public static override readonly stackMax = 99;

  public constructor(id: number) {
    super(id);
  }
}
