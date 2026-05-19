import type { System } from "@server/systems/System.ts";
import type { World } from "@server/world/World.ts";
import { EnergyTower } from "@server/entities/buildings/EnergyTower.ts";
import { CommsTower } from "@server/entities/buildings/CommsTower.ts";
import type { InfrastructureSnapshot } from "@shared/net/snapshots.ts";
import { infrastructureConfig } from "@shared/config/gameplayConfig.ts";

export class InfrastructureSystem implements System {
  private energyTowerId: number | null = null;
  private commsTowerId: number | null = null;
  private cachedEnergyActive = true;
  private cachedCommsActive = true;

  public spawnTowers(world: World): void {
    const { w, h } = world.gameConfig.worldSize;
    const cx = w / 2;
    const cy = h / 2;

    const energyTower = new EnergyTower(world.allocEntityId());
    energyTower.x = cx - infrastructureConfig.towerXOffset;
    energyTower.y = cy;
    world.spawn(energyTower);
    this.energyTowerId = energyTower.id;

    const commsTower = new CommsTower(world.allocEntityId());
    commsTower.x = cx + infrastructureConfig.towerXOffset;
    commsTower.y = cy;
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
