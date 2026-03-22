import { ResourceItem } from "@server/items/resources/ResourceItem.ts";

export class WoodItem extends ResourceItem {
  public static override readonly resourceName = "wood";
  public static override readonly stackMax = 999;

  public constructor(id: number) {
    super(id);
  }
}
