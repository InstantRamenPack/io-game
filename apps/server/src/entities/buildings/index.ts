import { Cannon } from "@server/entities/buildings/Cannon.ts";
import { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";

export { Cannon } from "@server/entities/buildings/Cannon.ts";
export { CraftingStation } from "@server/entities/buildings/CraftingStation.ts";
export { Wall } from "@server/entities/buildings/Wall.ts";

export const buildingEntityTypes = [Wall, Cannon, CraftingStation] as const;
