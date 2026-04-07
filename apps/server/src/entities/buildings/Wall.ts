import { Building } from "@server/entities/Building.ts";
import { getEntityContent } from "@shared/content/catalog.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";

export class Wall extends Building {
  public static override readonly resourceName = "wall";

  constructor(id: number, label: string, tier = 1, ownerId?: number) {
    const content = getEntityContent(
      makeResourceId("building", Wall.resourceName),
    );
    super(id, label, tier, ownerId, {
      baseHp: 180,
      hitboxProfiles:
        content?.hitboxProfiles ??
        ({
          default: [makeHitboxRect(40, 40)],
        } as const),
      activeHitboxProfile: content?.activeHitboxProfile,
    });
  }
}
