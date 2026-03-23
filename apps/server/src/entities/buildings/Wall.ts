import { Building } from "@server/entities/Building.ts";

export class Wall extends Building {
  public static override readonly resourceName = "wall";

  public constructor(
    id: number,
    label: string,
    tier = 1,
    ownerId?: number,
  ) {
    super(id, label, tier, ownerId, {
      baseHp: 180,
      radius: 20,
    });
  }
}
