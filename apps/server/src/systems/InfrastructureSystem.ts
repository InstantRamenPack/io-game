import type { World } from "@server/world/World.ts";
import { CommsTower } from "@server/entities/tower/CommsTower.ts";
import { EnergyTower } from "@server/entities/tower/EnergyTower.ts";
import type { InfrastructureSnapshot } from "@shared/net/snapshots.ts";

export class InfrastructureSystem {
  private energyTowerId: number | null = null;
  private commsTowerId: number | null = null;
  private cachedEnergyActive = true;
  private cachedCommsActive = true;

  public registerTowersFromWorld(world: World): void {
    this.energyTowerId = null;
    this.commsTowerId = null;

    for (const entity of world.entities.all()) {
      if (entity instanceof EnergyTower && this.energyTowerId === null) {
        this.energyTowerId = entity.id;
      }
      if (entity instanceof CommsTower && this.commsTowerId === null) {
        this.commsTowerId = entity.id;
      }
    }

    this.cachedEnergyActive = this.energyTowerId !== null;
    this.cachedCommsActive = this.commsTowerId !== null;
  }

  public update(world: World): void {
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
