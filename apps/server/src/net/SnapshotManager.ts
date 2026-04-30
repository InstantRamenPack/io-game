import type { NetEvent } from "@shared/net/events.ts";
import type { EntitySnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { Player } from "@server/entities/Player.ts";
import { EventRelevanceFilter } from "@server/net/snapshots/EventRelevanceFilter.ts";
import { PerPlayerReplicationState } from "@server/net/snapshots/PerPlayerReplicationState.ts";
import { SnapshotTickCache } from "@server/net/snapshots/SnapshotTickCache.ts";
import type { World } from "@server/world/World.ts";

const MAX_DELTA_REMOVED_IDS = 96;
const MAX_DELTA_ENTITY_UPDATES = 1024;

/**
 * Serializes authoritative world state after each completed server tick.
 * This keeps snapshot construction concerns out of GameServer.
 */
export class SnapshotManager {
  private readonly tickCache = new SnapshotTickCache();
  private readonly replicationState = new PerPlayerReplicationState();
  private readonly eventRelevanceFilter = new EventRelevanceFilter();
  private readonly queryBuffer: Entity[] = [];
  private readonly includedEntityMarkers = new Map<number, number>();
  private marker = 0;

  /**
   * Caches entity snapshots once per tick so per-client replication can reuse them.
   */
  public prepareTick(world: World, events: readonly NetEvent[]): void {
    this.tickCache.prepare(world);
    this.replicationState.pruneMissingPlayers(world);
    this.eventRelevanceFilter.prepare(events);
  }

  public makeSnapshotForPlayer(
    world: World,
    playerId: number,
    interestRadius: number,
  ): WorldSnapshot {
    if (this.tickCache.getPreparedTick() !== world.tick) {
      this.prepareTick(world, []);
    }

    const player = world.get<Player>(playerId);
    const dayNight =
      this.tickCache.getDayNightSnapshot() ?? world.dayNightSystem.toSnapshot();
    if (!player) {
      this.replicationState.forgetPlayer(playerId);
      return {
        tick: world.tick,
        dayNight,
        full: true,
        entities: [],
        removedEntityIds: [],
        events: [],
      };
    }

    const minX = player.x - interestRadius;
    const minY = player.y - interestRadius;
    const maxX = player.x + interestRadius;
    const maxY = player.y + interestRadius;
    const knownEntityVersions =
      this.replicationState.getKnownEntityVersions(playerId);
    const changedEntities: EntitySnapshot[] = [];
    const removedEntityIds: number[] = [];

    this.bumpMarker();
    this.recordVisibleEntityForPlayer(
      playerId,
      knownEntityVersions,
      changedEntities,
    );

    for (const entity of world.spatial.queryBox(
      minX,
      minY,
      maxX,
      maxY,
      this.queryBuffer,
    )) {
      if (this.isIncluded(entity.id)) {
        continue;
      }
      this.recordVisibleEntityForPlayer(
        entity.id,
        knownEntityVersions,
        changedEntities,
      );
    }

    for (const knownEntityId of knownEntityVersions.keys()) {
      if (this.isIncluded(knownEntityId)) {
        continue;
      }
      knownEntityVersions.delete(knownEntityId);
      removedEntityIds.push(knownEntityId);
    }

    const full =
      world.tick <= 2 ||
      removedEntityIds.length > MAX_DELTA_REMOVED_IDS ||
      changedEntities.length > MAX_DELTA_ENTITY_UPDATES;

    if (full) {
      const fullEntities = this.collectFullEntitiesForPlayer(
        world,
        playerId,
        minX,
        minY,
        maxX,
        maxY,
      );

      knownEntityVersions.clear();
      for (const entity of fullEntities) {
        knownEntityVersions.set(
          entity.id,
          this.tickCache.getSnapshotVersion(entity.id),
        );
      }

      return {
        tick: world.tick,
        dayNight,
        full: true,
        entities: fullEntities,
        removedEntityIds: [],
        events: this.eventRelevanceFilter.getRelevantEventsForPlayer(
          player.x,
          player.y,
          playerId,
          interestRadius,
        ),
      };
    }

    return {
      tick: world.tick,
      dayNight,
      full: false,
      entities: changedEntities,
      removedEntityIds,
      events: this.eventRelevanceFilter.getRelevantEventsForPlayer(
        player.x,
        player.y,
        playerId,
        interestRadius,
      ),
    };
  }

  private collectFullEntitiesForPlayer(
    world: World,
    playerId: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): EntitySnapshot[] {
    const entities: EntitySnapshot[] = [];
    this.bumpMarker();

    const playerSnapshot = this.tickCache.getSnapshot(playerId);
    if (playerSnapshot) {
      entities.push(playerSnapshot);
      this.markIncluded(playerId);
    }

    for (const entity of world.spatial.queryBox(
      minX,
      minY,
      maxX,
      maxY,
      this.queryBuffer,
    )) {
      if (this.isIncluded(entity.id)) {
        continue;
      }
      const snapshot = this.tickCache.getSnapshot(entity.id);
      if (!snapshot) {
        continue;
      }
      entities.push(snapshot);
      this.markIncluded(entity.id);
    }

    return entities;
  }

  private recordVisibleEntityForPlayer(
    entityId: number,
    knownEntityVersions: Map<number, number>,
    changedEntities: EntitySnapshot[],
  ): void {
    const snapshot = this.tickCache.getSnapshot(entityId);
    if (!snapshot) {
      return;
    }

    const snapshotVersion = this.tickCache.getSnapshotVersion(entityId);
    const knownVersion = knownEntityVersions.get(entityId);
    if (knownVersion !== snapshotVersion) {
      changedEntities.push(snapshot);
    }

    knownEntityVersions.set(entityId, snapshotVersion);
    this.markIncluded(entityId);
  }

  private bumpMarker(): void {
    this.marker += 1;
    if (this.marker >= Number.MAX_SAFE_INTEGER) {
      this.marker = 1;
      this.includedEntityMarkers.clear();
    }
  }

  private markIncluded(entityId: number): void {
    this.includedEntityMarkers.set(entityId, this.marker);
  }

  private isIncluded(entityId: number): boolean {
    return this.includedEntityMarkers.get(entityId) === this.marker;
  }
}
