import { Building } from "@server/entities/Building.ts";
import { getEntityContent } from "@shared/content/catalog.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";

export class CraftingStation extends Building {
  public static override readonly resourceName = "crafting_station";

  constructor(id: number, label: string, tier = 1, ownerId?: number) {
    const content = getEntityContent(
      makeResourceId("building", CraftingStation.resourceName),
    );
    super(id, label, tier, ownerId, {
      baseHp: 260,
      hitboxProfiles:
        content?.hitboxProfiles ?? ({
          default: [makeHitboxRect(52, 42)],
        } as const),
      activeHitboxProfile: content?.activeHitboxProfile,
    });
  }
}
