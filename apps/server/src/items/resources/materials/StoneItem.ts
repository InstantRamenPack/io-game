import { ResourceItem } from "@server/items/resources/ResourceItem.ts";

export class StoneItem extends ResourceItem {
  public static override readonly resourceName = "stone";
  public static override readonly stackMax = 999;

  public constructor(id: number) {
    super(id);
  }
}
