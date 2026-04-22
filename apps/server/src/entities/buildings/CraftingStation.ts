import { Building } from "@server/entities/Building.ts";

export class CraftingStation extends Building {
  public static override readonly resourceName = "crafting_station";

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }
}
