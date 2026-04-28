import { Structure } from "@server/entities/Structure.ts";

export class Tent extends Structure {
  public static override readonly resourceName = "tent";

  constructor(id: number) {
    super(id);
  }
}
