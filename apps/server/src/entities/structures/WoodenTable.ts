import { Structure } from "@server/entities/Structure.ts";

export class WoodenTable extends Structure {
  public static override readonly resourceName = "wooden_table";

  constructor(id: number) {
    super(id);
  }
}
