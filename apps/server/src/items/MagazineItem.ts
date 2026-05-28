import { Item } from "@server/items/Item.ts";

export abstract class MagazineItem extends Item {
  public static override readonly kind = "mag" as const;
}
