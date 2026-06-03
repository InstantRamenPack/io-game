import { Structure } from "@server/entities/Structure.ts";

export class Brazier extends Structure {
  public static override readonly resourceName = "brazier";

  constructor(id: number) {
    super(id);
  }
}
