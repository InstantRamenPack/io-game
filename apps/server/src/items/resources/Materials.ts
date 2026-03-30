import { CrossbowMagItem } from "@server/items/resources/materials/CrossbowMagItem.ts";
import { FoodItem } from "@server/items/resources/materials/FoodItem.ts";
import { GunMagItem } from "@server/items/resources/materials/GunMagItem.ts";
import { StoneItem } from "@server/items/resources/materials/StoneItem.ts";
import { WoodItem } from "@server/items/resources/materials/WoodItem.ts";

export { CrossbowMagItem } from "@server/items/resources/materials/CrossbowMagItem.ts";
export { FoodItem } from "@server/items/resources/materials/FoodItem.ts";
export { GunMagItem } from "@server/items/resources/materials/GunMagItem.ts";
export { StoneItem } from "@server/items/resources/materials/StoneItem.ts";
export { WoodItem } from "@server/items/resources/materials/WoodItem.ts";

export const materialItemTypes = [
  WoodItem,
  StoneItem,
  FoodItem,
  GunMagItem,
  CrossbowMagItem,
] as const;
