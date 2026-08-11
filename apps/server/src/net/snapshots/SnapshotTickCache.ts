import type {
  EntitySnapshot,
  ExtractionSnapshot,
  InfrastructureSnapshot,
  MapSnapshot,
  WorldSnapshot,
} from "@shared/net/snapshots.ts";
import {
  getEntityHitboxFingerprint,
  getEntityRuntimeFingerprint,
  runtimeFingerprintsMatch,
  type RuntimeFingerprintPart,
} from "@server/net/snapshots/SnapshotFingerprint.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";

type MinimapPlayerSnapshot = NonNullable<
  WorldSnapshot["minimapPlayers"]
>[number];

/**
 * Tick-scoped cache of serialized entity snapshots and version fingerprints.
 */
export class SnapshotTickCache {
  private preparedTick = -1;
  private preparedDayNight: WorldSnapshot["dayNight"] | null = null;
  private preparedExtraction: ExtractionSnapshot | null = null;
  private preparedInfrastructure: InfrastructureSnapshot | null = null;
  private preparedMapSnapshot: MapSnapshot | undefined = undefined;
  private preparedMapLayout: World["proceduralLayout"] = null;
  private preparedMinimapPlayers: MinimapPlayerSnapshot[] = [];
  private preparedWorld: World | null = null;
  private readonly snapshotByEntityId = new Map<number, EntitySnapshot>();
  private readonly previousFingerprintByEntityId = new Map<
    number,
    RuntimeFingerprintPart[]
  >();
  private readonly scratchFingerprintByEntityId = new Map<
    number,
    RuntimeFingerprintPart[]
  >();
  private readonly previousSnapshotByEntityId = new Map<
    number,
    EntitySnapshot
  >();
  private readonly previousEntityById = new Map<number, Entity>();
  private readonly snapshotVersionByEntityId = new Map<number, number>();
  private readonly previousHitboxFingerprintByEntityId = new Map<
    number,
    string
  >();
  private readonly hitboxVersionByEntityId = new Map<number, number>();
  private readonly fingerprintedTickByEntityId = new Map<number, number>();

  public prepare(world: World): void {
    this.preparedTick = world.tick;
    this.preparedDayNight = world.dayNightSystem.toSnapshot(
      world.waveSystem.countAliveWaveEnemies(world),
      world.waveSystem.getPendingWaveSpawnCount(),
      world.waveSystem.getNightWaveThreatTotal(),
    );
    this.preparedExtraction = world.extractionSystem?.toSnapshot() ?? null;
    this.preparedInfrastructure =
      world.infrastructureSystem?.toSnapshot() ?? null;
    this.preparedWorld = world;
    if (this.preparedMapLayout !== world.proceduralLayout) {
      this.preparedMapLayout = world.proceduralLayout;
      this.preparedMapSnapshot = makeMapSnapshot(world);
    }
    this.preparedMinimapPlayers = collectMinimapPlayers(world);
    this.snapshotByEntityId.clear();

    if (world.tick % 100 === 0) {
      for (const [entityId, entity] of this.previousEntityById) {
        if (world.get(entityId) !== entity) {
          this.deleteEntityState(entityId);
        }
      }
    }
  }

  private prepareEntity(entity: Entity): EntitySnapshot {
    this.syncEntityVersion(entity);
    let snapshot = this.snapshotByEntityId.get(entity.id);
    if (!snapshot) {
      snapshot = entity.toSnapshot() as EntitySnapshot;
      this.snapshotByEntityId.set(entity.id, snapshot);
      this.previousSnapshotByEntityId.set(entity.id, snapshot);
    }
    return snapshot;
  }

  private trackEntityIdentity(entity: Entity): void {
    const previousEntity = this.previousEntityById.get(entity.id);
    if (previousEntity !== entity) {
      if (previousEntity) {
        this.deleteEntityState(entity.id);
      }
      this.previousEntityById.set(entity.id, entity);
    }
  }

  public getPreparedTick(): number {
    return this.preparedTick;
  }

  public getDayNightSnapshot(): WorldSnapshot["dayNight"] | null {
    return this.preparedDayNight;
  }

  public getExtractionSnapshot(): ExtractionSnapshot | null {
    return this.preparedExtraction;
  }

  public getInfrastructureSnapshot(): InfrastructureSnapshot | null {
    return this.preparedInfrastructure;
  }

  public getMapSnapshot(): MapSnapshot | undefined {
    return this.preparedMapSnapshot;
  }

  public getMinimapPlayers(): readonly MinimapPlayerSnapshot[] {
    return this.preparedMinimapPlayers;
  }

  public getSnapshot(entityId: number): EntitySnapshot | undefined {
    const cached = this.snapshotByEntityId.get(entityId);
    if (cached) {
      return cached;
    }
    const entity = this.preparedWorld?.get(entityId);
    if (!entity) {
      this.deleteEntityState(entityId);
      return undefined;
    }
    return this.prepareEntity(entity);
  }

  public getSnapshotVersion(entityId: number): number {
    return this.snapshotVersionByEntityId.get(entityId) ?? 0;
  }

  public getHitboxVersion(entityId: number): number {
    return this.hitboxVersionByEntityId.get(entityId) ?? 0;
  }

  private syncEntityVersion(entity: Entity): void {
    this.trackEntityIdentity(entity);
    if (this.fingerprintedTickByEntityId.get(entity.id) === this.preparedTick) {
      return;
    }
    this.fingerprintedTickByEntityId.set(entity.id, this.preparedTick);

    const nextHitboxFingerprint = getEntityHitboxFingerprint(entity);
    const nextFingerprint = getEntityRuntimeFingerprint(
      entity,
      nextHitboxFingerprint,
      this.scratchFingerprintByEntityId.get(entity.id),
    );
    const previousFingerprint = this.previousFingerprintByEntityId.get(
      entity.id,
    );
    const previousHitboxFingerprint =
      this.previousHitboxFingerprintByEntityId.get(entity.id);
    const previousSnapshot = this.previousSnapshotByEntityId.get(entity.id);
    const previousVersion = this.snapshotVersionByEntityId.get(entity.id) ?? 0;
    const previousHitboxVersion =
      this.hitboxVersionByEntityId.get(entity.id) ?? 0;

    if (previousHitboxFingerprint !== nextHitboxFingerprint) {
      this.hitboxVersionByEntityId.set(entity.id, previousHitboxVersion + 1);
      this.previousHitboxFingerprintByEntityId.set(
        entity.id,
        nextHitboxFingerprint,
      );
    }

    const fingerprintChanged = !runtimeFingerprintsMatch(
      previousFingerprint,
      nextFingerprint,
    );
    if (!fingerprintChanged && previousSnapshot) {
      this.scratchFingerprintByEntityId.set(entity.id, nextFingerprint);
      this.snapshotByEntityId.set(entity.id, previousSnapshot);
      return;
    }

    if (fingerprintChanged) {
      this.previousSnapshotByEntityId.delete(entity.id);
      this.snapshotVersionByEntityId.set(entity.id, previousVersion + 1);
    }
    this.previousFingerprintByEntityId.set(entity.id, nextFingerprint);
    if (previousFingerprint) {
      this.scratchFingerprintByEntityId.set(entity.id, previousFingerprint);
    }
  }

  private deleteEntityState(entityId: number): void {
    this.snapshotByEntityId.delete(entityId);
    this.snapshotVersionByEntityId.delete(entityId);
    this.previousFingerprintByEntityId.delete(entityId);
    this.scratchFingerprintByEntityId.delete(entityId);
    this.previousSnapshotByEntityId.delete(entityId);
    this.previousHitboxFingerprintByEntityId.delete(entityId);
    this.hitboxVersionByEntityId.delete(entityId);
    this.fingerprintedTickByEntityId.delete(entityId);
    this.previousEntityById.delete(entityId);
  }
}

function collectMinimapPlayers(world: World): MinimapPlayerSnapshot[] {
  return world.entities.queryInstances(Player).map((player) => ({
    id: player.id,
    x: player.x,
    y: player.y,
    alive: player.alive,
  }));
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
    dungeonBounds: {
      minX: layout.dungeon.minX,
      minY: layout.dungeon.minY,
      maxX: layout.dungeon.maxX,
      maxY: layout.dungeon.maxY,
    },
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
      ...(marker.risk === undefined ? {} : { risk: marker.risk }),
      ...(marker.tier === undefined ? {} : { tier: marker.tier }),
    })),
  };
}
