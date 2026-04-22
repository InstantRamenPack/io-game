import { Building } from "@server/entities/Building.ts";

export class Tent extends Building {
  public static override readonly resourceName = "tent";

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }
}
