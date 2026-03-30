import { Cannon } from "@server/entities/buildings/Cannon.ts";
import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { Landmine } from "@server/entities/buildings/Landmine.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";

export { Cannon } from "@server/entities/buildings/Cannon.ts";
export { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
export { Landmine } from "@server/entities/buildings/Landmine.ts";
export { Wall } from "@server/entities/buildings/Wall.ts";

export const buildingEntityTypes = [
  Wall,
  Cannon,
  CraftingStation,
  Landmine,
] as const;
