import { Tower } from "@server/entities/tower/Tower.ts";

export class EnergyTower extends Tower {
  public static override readonly resourceName = "energy";

  constructor(id: number) {
    super(id, 1, undefined);
  }
}
