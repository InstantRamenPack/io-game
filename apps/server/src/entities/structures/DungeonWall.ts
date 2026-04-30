import { Structure } from "@server/entities/Structure.ts";

export class DungeonWall extends Structure {
  public static override readonly resourceName = "dungeon_wall";

  constructor(id: number) {
    super(id);
  }
}
