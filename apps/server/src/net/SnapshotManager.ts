import type { NetEvent } from "@shared/net/events.ts";
import type {
  EntitySnapshot,
  ExtractionSnapshot,
  InfrastructureSnapshot,
  WorldSnapshot,
} from "@shared/net/snapshots.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { Player } from "@server/entities/Player.ts";
import { EventRelevanceFilter } from "@server/net/snapshots/EventRelevanceFilter.ts";
import {
  PerPlayerReplicationState,
  type EntityReplicationState,
} from "@server/net/snapshots/PerPlayerReplicationState.ts";
import { stripKnownStableEntitySnapshotFields } from "@server/net/snapshots/EntitySnapshotDescriptor.ts";
import { SnapshotTickCache } from "@server/net/snapshots/SnapshotTickCache.ts";
import type { World } from "@server/world/World.ts";
import { extractionConfig } from "@shared/config/gameplayConfig.ts";

const MAX_DELTA_REMOVED_IDS = 96;

const LOCKED_EXTRACTION: ExtractionSnapshot = {
  stage: "active",
  boardElapsedTicks: 0,
  boardTimerGoalTicks: extractionConfig.boardTimerGoalTicks,
  chopperElapsedTicks: 0,
  playersOnPad: 0,
  totalAlivePlayers: 0,
  enemiesInRadius: 0,
};

const FULL_INFRASTRUCTURE: InfrastructureSnapshot = {
  energyActive: true,
  commsActive: true,
};
const MAX_DELTA_ENTITY_UPDATES = 1024;
const FULL_ENTITY_RELIABILITY_SENDS = 4;
const FULL_ENTITY_REFRESH_TICKS = 600;
const MAX_DENSE_ENTITY_ID = 65_535;

/**
 * Serializes authoritative world state after each completed server tick.
 * This keeps snapshot construction concerns out of GameServer.
 */
export class SnapshotManager {
  private readonly tickCache = new SnapshotTickCache();
  private readonly replicationState = new PerPlayerReplicationState();
  private readonly eventRelevanceFilter = new EventRelevanceFilter();
  private readonly queryBuffer: Entity[] = [];
  private includedDenseEntityMarkers = new Uint32Array(2_048);
  private readonly includedSparseEntityMarkers = new Map<number, number>();
  private cachedObserverSnapshot: WorldSnapshot | null = null;
  private marker = 0;

  /**
   * Caches entity snapshots once per tick so per-client replication can reuse them.
   */
  public prepareTick(world: World, events: readonly NetEvent[]): void {
    this.tickCache.prepare(world);
    this.cachedObserverSnapshot = null;
    this.replicationState.pruneMissingPlayers(world);
    this.eventRelevanceFilter.prepare(events);
  }

  public makeSnapshotForPlayer(
    world: World,
    playerId: number,
    interestRadius: number,
    centerOverride?: { x: number; y: number },
    includeAllEntities = false,
  ): WorldSnapshot {
    if (this.tickCache.getPreparedTick() !== world.tick) {
      this.prepareTick(world, []);
    }

    const player = world.get<Player>(playerId);
    const dayNight =
      this.tickCache.getDayNightSnapshot() ??
      world.dayNightSystem.toSnapshot(
        world.waveSystem.countAliveWaveEnemies(world),
        world.waveSystem.getPendingWaveSpawnCount(),
        world.waveSystem.getNightWaveThreatTotal(),
      );
    const extraction =
      this.tickCache.getExtractionSnapshot() ?? LOCKED_EXTRACTION;
    const infrastructure =
      this.tickCache.getInfrastructureSnapshot() ?? FULL_INFRASTRUCTURE;
    if (!player) {
      this.replicationState.forgetPlayer(playerId);
      return {
        tick: world.tick,
        dayNight,
        extraction,
        infrastructure,
        map: this.tickCache.getMapSnapshot(),
        minimapPlayers: [],
        full: true,
        entities: [],
        removedEntityIds: [],
        events: [],
      };
    }

    const centerX = centerOverride?.x ?? player.x;
    const centerY = centerOverride?.y ?? player.y;
    const minX = centerX - interestRadius;
    const minY = centerY - interestRadius;
    const maxX = centerX + interestRadius;
    const maxY = centerY + interestRadius;
    const knownEntities = this.replicationState.getEntities(playerId);
    const changedEntities: EntitySnapshot[] = [];
    const removedEntityIds: number[] = [];
    const firstSnapshotForPlayer = knownEntities.size === 0;

    this.bumpMarker();
    this.recordVisibleEntityForPlayer(
      playerId,
      knownEntities,
      changedEntities,
      world.tick,
    );

    const relevantEntities = includeAllEntities
      ? world.entities.all()
      : world.aoiSpatial.queryBoxExact(
          minX,
          minY,
          maxX,
          maxY,
          this.queryBuffer,
        );

    for (const entity of relevantEntities) {
      if (this.isIncluded(entity.id)) {
        continue;
      }
      this.recordVisibleEntityForPlayer(
        entity.id,
        knownEntities,
        changedEntities,
        world.tick,
      );
    }

    for (const knownEntityId of knownEntities.keys()) {
      if (this.isIncluded(knownEntityId)) {
        continue;
      }
      knownEntities.delete(knownEntityId);
      removedEntityIds.push(knownEntityId);
    }

    const full =
      world.tick <= 2 ||
      firstSnapshotForPlayer ||
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
        includeAllEntities,
      );

      knownEntities.clear();
      for (const entity of fullEntities) {
        knownEntities.set(entity.id, {
          version: this.tickCache.getSnapshotVersion(entity.id),
          hitboxVersion: this.tickCache.getHitboxVersion(entity.id),
          snapshot: entity,
          fullSnapshotCount: FULL_ENTITY_RELIABILITY_SENDS,
          lastFullSnapshotTick: world.tick,
        });
      }

      return {
        tick: world.tick,
        dayNight,
        extraction,
        infrastructure,
        map: this.tickCache.getMapSnapshot(),
        minimapPlayers: [...this.tickCache.getMinimapPlayers()],
        full: true,
        entities: fullEntities,
        removedEntityIds: [],
        events: this.eventRelevanceFilter.getRelevantEventsForPlayer(
          centerX,
          centerY,
          playerId,
          interestRadius,
        ),
      };
    }

    return {
      tick: world.tick,
      dayNight,
      extraction,
      infrastructure,
      map: undefined,
      minimapPlayers: [...this.tickCache.getMinimapPlayers()],
      full: false,
      entities: changedEntities,
      removedEntityIds,
      events: this.eventRelevanceFilter.getRelevantEventsForPlayer(
        centerX,
        centerY,
        playerId,
        interestRadius,
      ),
    };
  }

  public makeFullSnapshotForObserver(world: World): WorldSnapshot {
    if (this.tickCache.getPreparedTick() !== world.tick) {
      this.prepareTick(world, []);
    }
    if (this.cachedObserverSnapshot) {
      return this.cachedObserverSnapshot;
    }

    const dayNight =
      this.tickCache.getDayNightSnapshot() ??
      world.dayNightSystem.toSnapshot(
        world.waveSystem.countAliveWaveEnemies(world),
        world.waveSystem.getPendingWaveSpawnCount(),
        world.waveSystem.getNightWaveThreatTotal(),
      );
    const extraction =
      this.tickCache.getExtractionSnapshot() ?? LOCKED_EXTRACTION;
    const infrastructure =
      this.tickCache.getInfrastructureSnapshot() ?? FULL_INFRASTRUCTURE;
    const entities: EntitySnapshot[] = [];
    for (const entity of world.entities.all()) {
      const snapshot = this.tickCache.getSnapshot(entity.id);
      if (snapshot) {
        entities.push(snapshot);
      }
    }

    this.cachedObserverSnapshot = {
      tick: world.tick,
      dayNight,
      extraction,
      infrastructure,
      map: this.tickCache.getMapSnapshot(),
      minimapPlayers: [...this.tickCache.getMinimapPlayers()],
      full: true,
      entities,
      removedEntityIds: [],
      events: [],
    };
    return this.cachedObserverSnapshot;
  }

  private collectFullEntitiesForPlayer(
    world: World,
    playerId: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    includeAllEntities: boolean,
  ): EntitySnapshot[] {
    const entities: EntitySnapshot[] = [];
    this.bumpMarker();

    const playerSnapshot = this.tickCache.getSnapshot(playerId);
    if (playerSnapshot) {
      entities.push(playerSnapshot);
      this.markIncluded(playerId);
    }

    const relevantEntities = includeAllEntities
      ? world.entities.all()
      : world.aoiSpatial.queryBoxExact(
          minX,
          minY,
          maxX,
          maxY,
          this.queryBuffer,
        );

    for (const entity of relevantEntities) {
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
    knownEntities: Map<number, EntityReplicationState>,
    changedEntities: EntitySnapshot[],
    tick: number,
  ): void {
    const snapshot = this.tickCache.getSnapshot(entityId);
    if (!snapshot) {
      return;
    }

    const snapshotVersion = this.tickCache.getSnapshotVersion(entityId);
    const snapshotHitboxVersion = this.tickCache.getHitboxVersion(entityId);
    const known = knownEntities.get(entityId);
    const knownVersion = known?.version;
    const knownHitboxVersion = known?.hitboxVersion;
    const knownSnapshot = known?.snapshot;
    const fullSnapshotCount =
      knownHitboxVersion === snapshotHitboxVersion
        ? (known?.fullSnapshotCount ?? 0)
        : 0;
    const lastFullSnapshotTick =
      known?.lastFullSnapshotTick ?? Number.NEGATIVE_INFINITY;
    const shouldSendFullEntity =
      !knownSnapshot ||
      knownHitboxVersion !== snapshotHitboxVersion ||
      fullSnapshotCount < FULL_ENTITY_RELIABILITY_SENDS ||
      tick - lastFullSnapshotTick >= FULL_ENTITY_REFRESH_TICKS;

    if (knownVersion !== snapshotVersion || shouldSendFullEntity) {
      changedEntities.push(
        shouldSendFullEntity
          ? snapshot
          : stripKnownStableEntitySnapshotFields(snapshot, knownSnapshot),
      );
      if (shouldSendFullEntity) {
        if (known) {
          known.fullSnapshotCount = Math.min(
            FULL_ENTITY_RELIABILITY_SENDS,
            fullSnapshotCount + 1,
          );
          known.lastFullSnapshotTick = tick;
        }
      }
    }

    if (known) {
      known.version = snapshotVersion;
      known.hitboxVersion = snapshotHitboxVersion;
      known.snapshot = snapshot;
    } else {
      knownEntities.set(entityId, {
        version: snapshotVersion,
        hitboxVersion: snapshotHitboxVersion,
        snapshot,
        fullSnapshotCount: shouldSendFullEntity ? 1 : 0,
        lastFullSnapshotTick: shouldSendFullEntity
          ? tick
          : Number.NEGATIVE_INFINITY,
      });
    }
    this.markIncluded(entityId);
  }

  private bumpMarker(): void {
    this.marker = (this.marker + 1) >>> 0;
    if (this.marker === 0) {
      this.marker = 1;
      this.includedDenseEntityMarkers.fill(0);
      this.includedSparseEntityMarkers.clear();
    }
  }

  private markIncluded(entityId: number): void {
    if (entityId > MAX_DENSE_ENTITY_ID) {
      this.includedSparseEntityMarkers.set(entityId, this.marker);
      return;
    }
    if (entityId >= this.includedDenseEntityMarkers.length) {
      let capacity = this.includedDenseEntityMarkers.length;
      while (capacity <= entityId) {
        capacity *= 2;
      }
      const markers = new Uint32Array(capacity);
      markers.set(this.includedDenseEntityMarkers);
      this.includedDenseEntityMarkers = markers;
    }
    this.includedDenseEntityMarkers[entityId] = this.marker;
  }

  private isIncluded(entityId: number): boolean {
    return entityId <= MAX_DENSE_ENTITY_ID
      ? this.includedDenseEntityMarkers[entityId] === this.marker
      : this.includedSparseEntityMarkers.get(entityId) === this.marker;
  }
}
