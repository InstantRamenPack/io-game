import { Building } from "@server/entities/Building.ts";

export class BuildingXl extends Building {
  public static override readonly resourceName = "building_xl";

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }
}
