import { Structure } from "@server/entities/Structure.ts";

export class HouseXl extends Structure {
  public static override readonly resourceName = "house_xl";

  constructor(id: number) {
    super(id);
  }
}
