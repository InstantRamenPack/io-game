import { Structure } from "@server/entities/Structure.ts";

export class CampShelter extends Structure {
  public static override readonly resourceName = "camp_shelter";

  constructor(id: number) {
    super(id);
  }
}
