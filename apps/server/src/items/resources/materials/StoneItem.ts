import { ResourceItem } from "@server/items/resources/ResourceItem.ts";

export class StoneItem extends ResourceItem {
  public static readonly typeId = "item:stone" as const;

  public constructor(id: number) {
    super(id, StoneItem.typeId);
  }
}
