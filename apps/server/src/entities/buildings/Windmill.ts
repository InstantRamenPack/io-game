import { Building } from "@server/entities/Building.ts";

export class Windmill extends Building {
  public static readonly typeId = "building:windmill" as const;

  public constructor(
    id: number,
    label = "Windmill",
    tier = 1,
    ownerId?: number,
  ) {
    super(id, Windmill.typeId, label, tier, ownerId, {
      baseHp: 220,
      radius: 28,
    });
  }
}
