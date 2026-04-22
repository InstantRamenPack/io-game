import { Building } from "@server/entities/Building.ts";

export class Wall extends Building {
  public static override readonly resourceName = "wall";

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }
}
