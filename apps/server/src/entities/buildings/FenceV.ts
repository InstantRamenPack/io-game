import { Building } from "@server/entities/Building.ts";

export class FenceV extends Building {
  public static override readonly resourceName = "fence_v";

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }
}
