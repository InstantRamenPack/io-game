import { Building } from "@server/entities/Building.ts";

export class Windmill extends Building {
  public static override readonly resourceName = "windmill";

  public constructor(
    id: number,
    label: string,
    tier = 1,
    ownerId?: number,
  ) {
    super(id, label, tier, ownerId, {
      baseHp: 220,
      radius: 28,
    });
  }
}
