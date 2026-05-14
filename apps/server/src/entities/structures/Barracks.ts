import { Structure } from "@server/entities/Structure.ts";

export class Barracks extends Structure {
  public static override readonly resourceName = "barracks";

  constructor(id: number) {
    super(id);
  }
}
