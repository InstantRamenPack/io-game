import { StructureItem } from "@server/items/resources/StructureItem.ts";
import { CannonItem } from "@server/items/resources/structures/CannonItem.ts";
import { CraftingStationItem } from "@server/items/resources/structures/CraftingStationItem.ts";
import { LandmineItem } from "@server/items/resources/structures/LandmineItem.ts";
import { WallItem } from "@server/items/resources/structures/WallItem.ts";

export { StructureItem } from "@server/items/resources/StructureItem.ts";
export { CannonItem } from "@server/items/resources/structures/CannonItem.ts";
export { CraftingStationItem } from "@server/items/resources/structures/CraftingStationItem.ts";
export { LandmineItem } from "@server/items/resources/structures/LandmineItem.ts";
export { WallItem } from "@server/items/resources/structures/WallItem.ts";

export const structureItemTypes = [
  WallItem,
  CannonItem,
  CraftingStationItem,
  LandmineItem,
] as const;
