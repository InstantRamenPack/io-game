import { Building } from "@server/entities/Building.ts";
import { makeResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";
import type { BuildingSnapshot, TowerSnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

/**
 * Starter-sector towers (hub, energy, comms) share repairable death behavior:
 * stay in the world at 0 HP until repaired with hunk.
 */
export abstract class Tower extends Building {
  public static override get typeId(): ResourceId {
    return makeResourceId("tower", this.resourceName);
  }

  constructor(id: number, tier: number, ownerId: number | undefined) {
    super(id, tier, ownerId);
  }

  public override toSnapshot(): BuildingSnapshot {
    const snapshot = super.toSnapshot();
    const towerSnapshot: TowerSnapshot = {
      ...snapshot,
      kind: "tower",
    };
    return towerSnapshot as unknown as BuildingSnapshot;
  }

  public override handleDeath(_world: World): void {
    this.alive = false;
    this.hp = 0;
  }
}
