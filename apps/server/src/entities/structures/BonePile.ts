import { Structure } from "@server/entities/Structure.ts";

export class BonePile extends Structure {
  public static override readonly resourceName = "bone_pile";

  constructor(id: number) {
    super(id);
  }
}
