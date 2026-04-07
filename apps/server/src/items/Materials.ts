import { StoneItem } from "@server/items/materials/StoneItem.ts";
import { WoodItem } from "@server/items/materials/WoodItem.ts";

export { StoneItem } from "@server/items/materials/StoneItem.ts";
export { WoodItem } from "@server/items/materials/WoodItem.ts";

export const materialItemTypes = [WoodItem, StoneItem] as const;
