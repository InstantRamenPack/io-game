import { StructureItem } from "@server/items/resources/StructureItem.ts";
import { CannonItem } from "@server/items/resources/structures/CannonItem.ts";
import { CraftingStationItem } from "@server/items/resources/structures/CraftingStationItem.ts";
import { WallItem } from "@server/items/resources/structures/WallItem.ts";
import { WindmillItem } from "@server/items/resources/structures/WindmillItem.ts";

export { StructureItem } from "@server/items/resources/StructureItem.ts";
export { CannonItem } from "@server/items/resources/structures/CannonItem.ts";
export { CraftingStationItem } from "@server/items/resources/structures/CraftingStationItem.ts";
export { WallItem } from "@server/items/resources/structures/WallItem.ts";
export { WindmillItem } from "@server/items/resources/structures/WindmillItem.ts";

export const structureItemTypes = [
  WallItem,
  CannonItem,
  WindmillItem,
  CraftingStationItem,
] as const;
