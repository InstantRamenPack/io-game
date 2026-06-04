import { Structure } from "@server/entities/Structure.ts";

export class WeaponRack extends Structure {
  public static override readonly resourceName = "weapon_rack";

  constructor(id: number) {
    super(id);
  }
}
