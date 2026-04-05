import { Building } from "@server/entities/Building.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";

export class Wall extends Building {
  public static override readonly resourceName = "wall";

  constructor(id: number, label: string, tier = 1, ownerId?: number) {
    super(id, label, tier, ownerId, {
      baseHp: 180,
      hitboxProfiles: {
        default: [makeHitboxRect(40, 40)],
      },
    });
  }
}
