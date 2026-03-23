import { StructureItem } from "@server/items/resources/StructureItem.ts";
import { CraftingStationItem } from "@server/items/resources/structures/CraftingStationItem.ts";
import { TowerItem } from "@server/items/resources/structures/TowerItem.ts";
import { WallItem } from "@server/items/resources/structures/WallItem.ts";
import { WindmillItem } from "@server/items/resources/structures/WindmillItem.ts";

export { StructureItem } from "@server/items/resources/StructureItem.ts";
export { CraftingStationItem } from "@server/items/resources/structures/CraftingStationItem.ts";
export { TowerItem } from "@server/items/resources/structures/TowerItem.ts";
export { WallItem } from "@server/items/resources/structures/WallItem.ts";
export { WindmillItem } from "@server/items/resources/structures/WindmillItem.ts";

export const structureItemTypes = [
  WallItem,
  TowerItem,
  WindmillItem,
  CraftingStationItem,
] as const;
