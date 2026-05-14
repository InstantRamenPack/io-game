import { Structure } from "@server/entities/Structure.ts";

export class GuardTower extends Structure {
  public static override readonly resourceName = "guard_tower";

  constructor(id: number) {
    super(id);
  }
}
