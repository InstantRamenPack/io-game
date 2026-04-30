import { Building } from "@server/entities/Building.ts";

export class Recycler extends Building {
  public static override readonly resourceName = "recycler";

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }
}
