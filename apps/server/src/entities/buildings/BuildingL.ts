import { Building } from "@server/entities/Building.ts";

export class BuildingL extends Building {
  public static override readonly resourceName = "building_l";

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }
}
