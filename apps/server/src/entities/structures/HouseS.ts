import { Structure } from "@server/entities/Structure.ts";

export class HouseS extends Structure {
  public static override readonly resourceName = "house_s";

  constructor(id: number) {
    super(id);
  }
}
