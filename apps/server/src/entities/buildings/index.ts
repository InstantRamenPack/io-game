import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { Tower } from "@server/entities/buildings/Tower.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Windmill } from "@server/entities/buildings/Windmill.ts";

export { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
export { Tower } from "@server/entities/buildings/Tower.ts";
export { Wall } from "@server/entities/buildings/Wall.ts";
export { Windmill } from "@server/entities/buildings/Windmill.ts";

export const buildingEntityTypes = [
  Wall,
  Tower,
  Windmill,
  CraftingStation,
] as const;
