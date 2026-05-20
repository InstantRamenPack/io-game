import { Structure } from "@server/entities/Structure.ts";

export class WoodenChair extends Structure {
  public static override readonly resourceName = "wooden_chair";

  constructor(id: number) {
    super(id);
  }
}
