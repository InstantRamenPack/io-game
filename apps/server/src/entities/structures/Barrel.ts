import { Structure } from "@server/entities/Structure.ts";

export class Barrel extends Structure {
  public static override readonly resourceName = "barrel";

  constructor(id: number) {
    super(id);
  }
}
