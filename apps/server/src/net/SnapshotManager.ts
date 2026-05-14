import type { NetEvent } from "@shared/net/events.ts";
import type {
  EntitySnapshot,
  EquippedItemSnapshot,
  ExtractionSnapshot,
  InfrastructureSnapshot,
  MapSnapshot,
  WorldSnapshot,
} from "@shared/net/snapshots.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import { EventRelevanceFilter } from "@server/net/snapshots/EventRelevanceFilter.ts";
import { PerPlayerReplicationState } from "@server/net/snapshots/PerPlayerReplicationState.ts";
import { SnapshotTickCache } from "@server/net/snapshots/SnapshotTickCache.ts";
import type { World } from "@server/world/World.ts";

const MAX_DELTA_REMOVED_IDS = 96;

const LOCKED_EXTRACTION: ExtractionSnapshot = {
  stage: "locked",
  lockedReason: "final_wave",
  boardElapsedMs: 0,
  chopperElapsedMs: 0,
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
    centerOverride?: { x: number; y: number },
  ): WorldSnapshot {
    if (this.tickCache.getPreparedTick() !== world.tick) {
      this.prepareTick(world, []);
    }

    const player = world.get<Player>(playerId);
    const dayNight =
      this.tickCache.getDayNightSnapshot() ?? world.dayNightSystem.toSnapshot();
    const extraction =
      this.tickCache.getExtractionSnapshot() ?? LOCKED_EXTRACTION;
    const infrastructure =
      this.tickCache.getInfrastructureSnapshot() ?? FULL_INFRASTRUCTURE;
    const map = makeMapSnapshot(world);
    if (!player) {
      this.replicationState.forgetPlayer(playerId);
      return {
        tick: world.tick,
        dayNight,
        extraction,
        infrastructure,
        map,
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
    const knownEntityVersions =
      this.replicationState.getKnownEntityVersions(playerId);
    const knownEntityHitboxVersions =
      this.replicationState.getKnownEntityHitboxVersions(playerId);
    const knownEntitySnapshots =
      this.replicationState.getKnownEntitySnapshots(playerId);
    const fullEntitySnapshotCounts =
      this.replicationState.getFullEntitySnapshotCounts(playerId);
    const lastFullEntitySnapshotTicks =
      this.replicationState.getLastFullEntitySnapshotTicks(playerId);
    const changedEntities: EntitySnapshot[] = [];
    const removedEntityIds: number[] = [];
    const firstSnapshotForPlayer = knownEntityVersions.size === 0;

    this.bumpMarker();
    this.recordVisibleEntityForPlayer(
      playerId,
      knownEntityVersions,
      knownEntityHitboxVersions,
      knownEntitySnapshots,
      fullEntitySnapshotCounts,
      lastFullEntitySnapshotTicks,
      changedEntities,
      world.tick,
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
        knownEntityHitboxVersions,
        knownEntitySnapshots,
        fullEntitySnapshotCounts,
        lastFullEntitySnapshotTicks,
        changedEntities,
        world.tick,
      );
    }

    for (const knownEntityId of knownEntityVersions.keys()) {
      if (this.isIncluded(knownEntityId)) {
        continue;
      }
      knownEntityVersions.delete(knownEntityId);
      knownEntityHitboxVersions.delete(knownEntityId);
      knownEntitySnapshots.delete(knownEntityId);
      fullEntitySnapshotCounts.delete(knownEntityId);
      lastFullEntitySnapshotTicks.delete(knownEntityId);
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
      );

      knownEntityVersions.clear();
      knownEntityHitboxVersions.clear();
      knownEntitySnapshots.clear();
      fullEntitySnapshotCounts.clear();
      lastFullEntitySnapshotTicks.clear();
      for (const entity of fullEntities) {
        knownEntityVersions.set(
          entity.id,
          this.tickCache.getSnapshotVersion(entity.id),
        );
        knownEntityHitboxVersions.set(
          entity.id,
          this.tickCache.getHitboxVersion(entity.id),
        );
        knownEntitySnapshots.set(entity.id, entity);
        fullEntitySnapshotCounts.set(entity.id, FULL_ENTITY_RELIABILITY_SENDS);
        lastFullEntitySnapshotTicks.set(entity.id, world.tick);
      }

      return {
        tick: world.tick,
        dayNight,
        extraction,
        infrastructure,
        map,
        minimapPlayers: this.collectMinimapPlayers(world),
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
      minimapPlayers: this.collectMinimapPlayers(world),
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
    knownEntityHitboxVersions: Map<number, number>,
    knownEntitySnapshots: Map<number, EntitySnapshot>,
    fullEntitySnapshotCounts: Map<number, number>,
    lastFullEntitySnapshotTicks: Map<number, number>,
    changedEntities: EntitySnapshot[],
    tick: number,
  ): void {
    const snapshot = this.tickCache.getSnapshot(entityId);
    if (!snapshot) {
      return;
    }

    const snapshotVersion = this.tickCache.getSnapshotVersion(entityId);
    const snapshotHitboxVersion = this.tickCache.getHitboxVersion(entityId);
    const knownVersion = knownEntityVersions.get(entityId);
    const knownHitboxVersion = knownEntityHitboxVersions.get(entityId);
    const knownSnapshot = knownEntitySnapshots.get(entityId);
    const fullSnapshotCount =
      knownHitboxVersion === snapshotHitboxVersion
        ? (fullEntitySnapshotCounts.get(entityId) ?? 0)
        : 0;
    const lastFullSnapshotTick =
      lastFullEntitySnapshotTicks.get(entityId) ?? Number.NEGATIVE_INFINITY;
    const shouldSendFullEntity =
      !knownSnapshot ||
      knownHitboxVersion !== snapshotHitboxVersion ||
      fullSnapshotCount < FULL_ENTITY_RELIABILITY_SENDS ||
      tick - lastFullSnapshotTick >= FULL_ENTITY_REFRESH_TICKS;

    if (knownVersion !== snapshotVersion || shouldSendFullEntity) {
      changedEntities.push(
        shouldSendFullEntity
          ? snapshot
          : stripStableKnownFields(snapshot, knownSnapshot),
      );
      if (shouldSendFullEntity) {
        fullEntitySnapshotCounts.set(
          entityId,
          Math.min(FULL_ENTITY_RELIABILITY_SENDS, fullSnapshotCount + 1),
        );
        lastFullEntitySnapshotTicks.set(entityId, tick);
      }
    }

    knownEntityVersions.set(entityId, snapshotVersion);
    knownEntityHitboxVersions.set(entityId, snapshotHitboxVersion);
    knownEntitySnapshots.set(entityId, snapshot);
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

  private collectMinimapPlayers(
    world: World,
  ): Array<{ id: number; x: number; y: number; alive: boolean }> {
    return world.entities.queryInstances(Player).map((player) => ({
      id: player.id,
      x: player.x,
      y: player.y,
      alive: player.alive,
    }));
  }
}

function makeMapSnapshot(world: World): MapSnapshot | undefined {
  const layout = world.proceduralLayout;
  if (!layout) {
    return undefined;
  }
  return {
    seed: layout.seed,
    sectorSize: layout.sectorSize,
    centerSectorId: layout.centerSectorId,
    extractionSectorId: layout.extractionSectorId,
    dungeonSectorId: layout.dungeonSectorId,
    militarySectorId: layout.militarySectorId,
    forestSectorId: layout.forestSectorId,
    sectors: layout.sectors.map((sector) => ({
      id: sector.id,
      label: sector.label,
      archetype: sector.archetype,
      row: sector.row,
      col: sector.col,
      minX: sector.minX,
      minY: sector.minY,
      maxX: sector.maxX,
      maxY: sector.maxY,
      hasLightsOut: sector.hasLightsOut,
    })),
    features: layout.sectors.flatMap((sector) =>
      sector.features.map((feature) => ({
        id: feature.id,
        label: feature.label,
        role: feature.role,
        risk: feature.risk,
        hasReward: feature.hasReward,
        minX: feature.minX,
        minY: feature.minY,
        maxX: feature.maxX,
        maxY: feature.maxY,
        centerX: feature.center.x,
        centerY: feature.center.y,
      })),
    ),
    markers: layout.minimapMarkers.map((marker) => ({
      id: marker.id,
      label: marker.label,
      archetype: marker.archetype,
      importance: marker.importance,
      discoveredByDefault: marker.discoveredByDefault,
      x: marker.x,
      y: marker.y,
    })),
  };
}

function stripStableKnownFields(
  snapshot: EntitySnapshot,
  knownSnapshot: EntitySnapshot,
): EntitySnapshot {
  const deltaSnapshot = { ...snapshot };
  delete deltaSnapshot.hitboxes;

  if (deltaSnapshot.typeId === knownSnapshot.typeId) {
    delete deltaSnapshot.typeId;
  }
  if (deltaSnapshot.maxHp === knownSnapshot.maxHp) {
    delete deltaSnapshot.maxHp;
  }
  if (deltaSnapshot.hp === knownSnapshot.hp) {
    delete deltaSnapshot.hp;
  }
  if (deltaSnapshot.alive === knownSnapshot.alive) {
    delete deltaSnapshot.alive;
  }
  if (deltaSnapshot.ownerId === knownSnapshot.ownerId) {
    delete deltaSnapshot.ownerId;
  }

  if (deltaSnapshot.kind === "enemy" && knownSnapshot.kind === "enemy") {
    if (deltaSnapshot.targetId === knownSnapshot.targetId) {
      delete deltaSnapshot.targetId;
    }
    if (
      equippedItemsMatch(deltaSnapshot.equippedItem, knownSnapshot.equippedItem)
    ) {
      delete deltaSnapshot.equippedItem;
    }
  }

  return deltaSnapshot as EntitySnapshot;
}

function equippedItemsMatch(
  left: EquippedItemSnapshot | undefined,
  right: EquippedItemSnapshot | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.typeId === right.typeId &&
    left.attackStyle === right.attackStyle &&
    left.cooldownTicksRemaining === right.cooldownTicksRemaining &&
    left.ammoInMag === right.ammoInMag &&
    left.magSize === right.magSize &&
    left.reserveMagCount === right.reserveMagCount &&
    left.reloadTicks === right.reloadTicks &&
    left.reloadTicksRemaining === right.reloadTicksRemaining
  );
}
