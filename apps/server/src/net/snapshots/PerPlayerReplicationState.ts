import type { EntitySnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

/**
 * Tracks the last replicated entity versions per player.
 */
export class PerPlayerReplicationState {
  private readonly knownEntityVersionsByPlayerId = new Map<
    number,
    Map<number, number>
  >();
  private readonly knownEntityHitboxVersionsByPlayerId = new Map<
    number,
    Map<number, number>
  >();
  private readonly knownEntitySnapshotsByPlayerId = new Map<
    number,
    Map<number, EntitySnapshot>
  >();
  private readonly fullEntitySnapshotCountsByPlayerId = new Map<
    number,
    Map<number, number>
  >();
  private readonly lastFullEntitySnapshotTicksByPlayerId = new Map<
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

  public getKnownEntityHitboxVersions(playerId: number): Map<number, number> {
    let knownEntityHitboxVersions =
      this.knownEntityHitboxVersionsByPlayerId.get(playerId);
    if (!knownEntityHitboxVersions) {
      knownEntityHitboxVersions = new Map<number, number>();
      this.knownEntityHitboxVersionsByPlayerId.set(
        playerId,
        knownEntityHitboxVersions,
      );
    }
    return knownEntityHitboxVersions;
  }

  public getKnownEntitySnapshots(
    playerId: number,
  ): Map<number, EntitySnapshot> {
    let knownEntitySnapshots =
      this.knownEntitySnapshotsByPlayerId.get(playerId);
    if (!knownEntitySnapshots) {
      knownEntitySnapshots = new Map<number, EntitySnapshot>();
      this.knownEntitySnapshotsByPlayerId.set(playerId, knownEntitySnapshots);
    }
    return knownEntitySnapshots;
  }

  public getFullEntitySnapshotCounts(playerId: number): Map<number, number> {
    let fullEntitySnapshotCounts =
      this.fullEntitySnapshotCountsByPlayerId.get(playerId);
    if (!fullEntitySnapshotCounts) {
      fullEntitySnapshotCounts = new Map<number, number>();
      this.fullEntitySnapshotCountsByPlayerId.set(
        playerId,
        fullEntitySnapshotCounts,
      );
    }
    return fullEntitySnapshotCounts;
  }

  public getLastFullEntitySnapshotTicks(playerId: number): Map<number, number> {
    let lastFullEntitySnapshotTicks =
      this.lastFullEntitySnapshotTicksByPlayerId.get(playerId);
    if (!lastFullEntitySnapshotTicks) {
      lastFullEntitySnapshotTicks = new Map<number, number>();
      this.lastFullEntitySnapshotTicksByPlayerId.set(
        playerId,
        lastFullEntitySnapshotTicks,
      );
    }
    return lastFullEntitySnapshotTicks;
  }

  public forgetPlayer(playerId: number): void {
    this.knownEntityVersionsByPlayerId.delete(playerId);
    this.knownEntityHitboxVersionsByPlayerId.delete(playerId);
    this.knownEntitySnapshotsByPlayerId.delete(playerId);
    this.fullEntitySnapshotCountsByPlayerId.delete(playerId);
    this.lastFullEntitySnapshotTicksByPlayerId.delete(playerId);
  }

  public pruneMissingPlayers(world: World): void {
    for (const playerId of [...this.knownEntityVersionsByPlayerId.keys()]) {
      if (world.entities.has(playerId)) {
        continue;
      }
      this.knownEntityVersionsByPlayerId.delete(playerId);
      this.knownEntityHitboxVersionsByPlayerId.delete(playerId);
      this.knownEntitySnapshotsByPlayerId.delete(playerId);
      this.fullEntitySnapshotCountsByPlayerId.delete(playerId);
      this.lastFullEntitySnapshotTicksByPlayerId.delete(playerId);
    }
    for (const playerId of [
      ...this.knownEntityHitboxVersionsByPlayerId.keys(),
    ]) {
      if (world.entities.has(playerId)) {
        continue;
      }
      this.knownEntityHitboxVersionsByPlayerId.delete(playerId);
    }
    for (const playerId of [...this.knownEntitySnapshotsByPlayerId.keys()]) {
      if (world.entities.has(playerId)) {
        continue;
      }
      this.knownEntitySnapshotsByPlayerId.delete(playerId);
    }
    for (const playerId of [
      ...this.fullEntitySnapshotCountsByPlayerId.keys(),
    ]) {
      if (world.entities.has(playerId)) {
        continue;
      }
      this.fullEntitySnapshotCountsByPlayerId.delete(playerId);
    }
    for (const playerId of [
      ...this.lastFullEntitySnapshotTicksByPlayerId.keys(),
    ]) {
      if (world.entities.has(playerId)) {
        continue;
      }
      this.lastFullEntitySnapshotTicksByPlayerId.delete(playerId);
    }
  }
}
