import { Building } from "@server/entities/Building.ts";

export class BuildingM extends Building {
  public static override readonly resourceName = "building_m";

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }
}
