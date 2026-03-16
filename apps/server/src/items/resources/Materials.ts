import { ResourceItem } from "@server/items/resources/ResourceItem.ts";

export class WoodItem extends ResourceItem {
  static readonly typeId = "item:wood" as const;

  constructor(id: number) {
    super(id, WoodItem.typeId);
  }
}

export class StoneItem extends ResourceItem {
  static readonly typeId = "item:stone" as const;

  constructor(id: number) {
    super(id, StoneItem.typeId);
  }
}

export class FoodItem extends ResourceItem {
  static readonly typeId = "item:food" as const;

  constructor(id: number) {
    super(id, FoodItem.typeId);
  }
}
