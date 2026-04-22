import { Building } from "@server/entities/Building.ts";

export class Tree extends Building {
  public static override readonly resourceName = "tree";

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }
}
