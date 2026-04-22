import type { World } from "@server/world/World.ts";

/**
 * Tracks the last replicated entity versions per player.
 */
export class PerPlayerReplicationState {
  private readonly knownEntityVersionsByPlayerId = new Map<
    number,
    Map<number, number>
  >();

  public getKnownEntityVersions(playerId: number): Map<number, number> {
    let knownEntityVersions = this.knownEntityVersionsByPlayerId.get(playerId);
    if (!knownEntityVersions) {
      knownEntityVersions = new Map<number, number>();
      this.knownEntityVersionsByPlayerId.set(playerId, knownEntityVersions);
    }
    return knownEntityVersions;
  }

  public forgetPlayer(playerId: number): void {
    this.knownEntityVersionsByPlayerId.delete(playerId);
  }

  public pruneMissingPlayers(world: World): void {
    for (const playerId of [...this.knownEntityVersionsByPlayerId.keys()]) {
      if (world.entities.has(playerId)) {
        continue;
      }
      this.knownEntityVersionsByPlayerId.delete(playerId);
    }
  }
}
