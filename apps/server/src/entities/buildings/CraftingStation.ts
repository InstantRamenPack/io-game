import { Building } from "@server/entities/Building.ts";

export class CraftingStation extends Building {
  public static readonly typeId = "building:crafting_station" as const;

  public constructor(
    id: number,
    label = "Crafting Station",
    tier = 1,
    ownerId?: number,
  ) {
    super(id, CraftingStation.typeId, label, tier, ownerId, {
      baseHp: 260,
      radius: 26,
    });
  }
}
