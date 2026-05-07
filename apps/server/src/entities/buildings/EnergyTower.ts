import { Building } from "@server/entities/Building.ts";
import type { World } from "@server/world/World.ts";

export class EnergyTower extends Building {
  public static override readonly resourceName = "energy_tower";

  constructor(id: number) {
    super(id, 1, undefined);
  }

  public override handleDeath(world: World): void {
    this.alive = false;
    this.hp = 0;
    world.focusedTrace.recordEntityEvent(world, "tower_destroyed", this, {
      kind: "energy_tower",
    });
  }
}
