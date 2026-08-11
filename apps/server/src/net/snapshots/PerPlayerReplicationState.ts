import type { EntitySnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

export type EntityReplicationState = {
  version: number;
  hitboxVersion: number;
  snapshot: EntitySnapshot;
  fullSnapshotCount: number;
  lastFullSnapshotTick: number;
};

/** Tracks the last replicated entity state per player. */
export class PerPlayerReplicationState {
  private readonly entitiesByPlayerId = new Map<
    number,
    Map<number, EntityReplicationState>
  >();

  public getEntities(playerId: number): Map<number, EntityReplicationState> {
    let entities = this.entitiesByPlayerId.get(playerId);
    if (!entities) {
      entities = new Map<number, EntityReplicationState>();
      this.entitiesByPlayerId.set(playerId, entities);
    }
    return entities;
  }

  public forgetPlayer(playerId: number): void {
    this.entitiesByPlayerId.delete(playerId);
  }

  public pruneMissingPlayers(world: World): void {
    for (const playerId of this.entitiesByPlayerId.keys()) {
      if (!world.entities.has(playerId)) {
        this.entitiesByPlayerId.delete(playerId);
      }
    }
  }
}
