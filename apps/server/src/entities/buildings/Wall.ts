import { Building } from "@server/entities/Building.ts";
import { requireEntityContent } from "@shared/content/catalog.ts";

export class Wall extends Building {
  public static override readonly resourceName = "wall";

  public constructor(
    id: number,
    label = requireEntityContent(Wall.typeId).label,
    tier = 1,
    ownerId?: number,
  ) {
    super(id, label, tier, ownerId, {
      baseHp: 180,
      radius: 20,
    });
  }
}
