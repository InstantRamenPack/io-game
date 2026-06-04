import { Structure } from "@server/entities/Structure.ts";

export class GoldPile extends Structure {
  public static override readonly resourceName = "gold_pile";

  constructor(id: number) {
    super(id);
  }
}
