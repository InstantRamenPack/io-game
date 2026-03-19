import { Building } from "@server/entities/Building.ts";

export class Tower extends Building {
  public static readonly typeId = "building:tower" as const;

  public constructor(id: number, label = "Tower", tier = 1, ownerId?: number) {
    super(id, Tower.typeId, label, tier, ownerId, {
      baseHp: 240,
      radius: 24,
    });
  }
}
