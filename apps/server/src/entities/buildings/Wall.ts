import { Building } from "@server/entities/Building.ts";

export class Wall extends Building {
  public static readonly typeId = "building:wall" as const;

  public constructor(id: number, label = "Wall", tier = 1, ownerId?: number) {
    super(id, Wall.typeId, label, tier, ownerId, {
      baseHp: 180,
      radius: 20,
    });
  }
}
