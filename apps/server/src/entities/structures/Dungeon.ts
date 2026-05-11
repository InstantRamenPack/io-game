import { Structure } from "@server/entities/Structure.ts";

export class Dungeon extends Structure {
  public static override readonly resourceName = "dungeon";

  constructor(id: number) {
    super(id);
  }
}
