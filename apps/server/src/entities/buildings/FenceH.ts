import { Building } from "@server/entities/Building.ts";

export class FenceH extends Building {
  public static override readonly resourceName = "fence_h";

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }
}
