import { Building } from "@server/entities/Building.ts";
import { requireEntityContent } from "@shared/content/catalog.ts";

export class Windmill extends Building {
  public static override readonly resourceName = "windmill";

  public constructor(
    id: number,
    label = requireEntityContent(Windmill.typeId).label,
    tier = 1,
    ownerId?: number,
  ) {
    super(id, label, tier, ownerId, {
      baseHp: 220,
      radius: 28,
    });
  }
}
