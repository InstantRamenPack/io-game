import { Structure } from "@server/entities/Structure.ts";

export class WoodenBed extends Structure {
  public static override readonly resourceName = "wooden_bed";

  constructor(id: number) {
    super(id);
  }
}
