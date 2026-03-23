import { Building } from "@server/entities/Building.ts";

export class CraftingStation extends Building {
  public static override readonly resourceName = "crafting_station";

  public constructor(
    id: number,
    label: string,
    tier = 1,
    ownerId?: number,
  ) {
    super(id, label, tier, ownerId, {
      baseHp: 260,
      radius: 26,
    });
  }
}
