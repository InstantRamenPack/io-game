import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";
import { EnergyTower } from "@server/entities/buildings/EnergyTower.ts";
import { CommsTower } from "@server/entities/buildings/CommsTower.ts";
import type { InfrastructureSnapshot } from "@shared/net/snapshots.ts";

export const ENERGY_TOWER_X = 4520;
export const ENERGY_TOWER_Y = 3500;
export const COMMS_TOWER_X = 5480;
export const COMMS_TOWER_Y = 3500;

export class InfrastructureSystem implements System {
  private energyTowerId: number | null = null;
  private commsTowerId: number | null = null;
  private cachedEnergyActive = true;
  private cachedCommsActive = true;

  public spawnTowers(world: World): void {
    const energyTower = new EnergyTower(world.allocEntityId());
    energyTower.x = ENERGY_TOWER_X;
    energyTower.y = ENERGY_TOWER_Y;
    world.spawn(energyTower);
    this.energyTowerId = energyTower.id;

    const commsTower = new CommsTower(world.allocEntityId());
    commsTower.x = COMMS_TOWER_X;
    commsTower.y = COMMS_TOWER_Y;
    world.spawn(commsTower);
    this.commsTowerId = commsTower.id;
  }

  public update(world: World, _deltaMs: number): void {
    if (this.energyTowerId !== null) {
      const entity = world.get(this.energyTowerId);
      this.cachedEnergyActive = entity !== undefined && entity.alive;
    }

    if (this.commsTowerId !== null) {
      const entity = world.get(this.commsTowerId);
      this.cachedCommsActive = entity !== undefined && entity.alive;
    }
  }

  public isEnergyActive(): boolean {
    return this.cachedEnergyActive;
  }

  public isCommsActive(): boolean {
    return this.cachedCommsActive;
  }

  public toSnapshot(): InfrastructureSnapshot {
    return {
      energyActive: this.cachedEnergyActive,
      commsActive: this.cachedCommsActive,
    };
  }
}
