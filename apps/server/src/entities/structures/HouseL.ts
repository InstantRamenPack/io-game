import { Structure } from "@server/entities/Structure.ts";

export class HouseL extends Structure {
  public static override readonly resourceName = "house_l";

  constructor(id: number) {
    super(id);
  }
}
