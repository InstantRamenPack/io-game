import { Structure } from "@server/entities/Structure.ts";

export class StonePillar extends Structure {
  public static override readonly resourceName = "stone_pillar";

  constructor(id: number) {
    super(id);
  }
}
