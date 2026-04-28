import { Structure } from "@server/entities/Structure.ts";

export class HouseM extends Structure {
  public static override readonly resourceName = "house_m";

  constructor(id: number) {
    super(id);
  }
}
