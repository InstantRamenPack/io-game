import { Structure } from "@server/entities/Structure.ts";

export class GoldenStatue extends Structure {
  public static override readonly resourceName = "golden_statue";

  constructor(id: number) {
    super(id);
  }
}
