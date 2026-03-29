import { Building } from "@server/entities/Building.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";

export class CraftingStation extends Building {
  public static override readonly resourceName = "crafting_station";

  public constructor(id: number, label: string, tier = 1, ownerId?: number) {
    super(id, label, tier, ownerId, {
      baseHp: 260,
      hitboxProfiles: {
        default: [makeHitboxRect(52, 42)],
      },
    });
  }
}
