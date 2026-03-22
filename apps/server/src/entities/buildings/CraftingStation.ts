import { Building } from "@server/entities/Building.ts";
import { requireEntityContent } from "@shared/content/catalog.ts";

export class CraftingStation extends Building {
  public static override readonly resourceName = "crafting_station";

  public constructor(
    id: number,
    label = requireEntityContent(CraftingStation.typeId).label,
    tier = 1,
    ownerId?: number,
  ) {
    super(id, label, tier, ownerId, {
      baseHp: 260,
      radius: 26,
    });
  }
}
