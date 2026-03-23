import { Building } from "@server/entities/Building.ts";

export class Tower extends Building {
  public static override readonly resourceName = "tower";

  public constructor(
    id: number,
    label: string,
    tier = 1,
    ownerId?: number,
  ) {
    super(id, label, tier, ownerId, {
      baseHp: 240,
      radius: 24,
    });
  }
}
