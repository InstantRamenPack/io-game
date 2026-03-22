import { Building } from "@server/entities/Building.ts";
import { requireEntityContent } from "@shared/content/catalog.ts";

export class Tower extends Building {
  public static override readonly resourceName = "tower";

  public constructor(
    id: number,
    label = requireEntityContent(Tower.typeId).label,
    tier = 1,
    ownerId?: number,
  ) {
    super(id, label, tier, ownerId, {
      baseHp: 240,
      radius: 24,
    });
  }
}
