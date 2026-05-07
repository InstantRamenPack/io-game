import Denque from "denque";
import seedrandom from "seedrandom";
import type { GameConfig } from "@shared/config/GameConfig.ts";
import { IdGenerator } from "@shared/math/IdGenerator.ts";
import type { NetEvent } from "@shared/net/events.ts";
import {
  getSectorForPoint,
  type ProceduralWorldLayout,
} from "@shared/world/ProceduralWorld.ts";
import { FocusedServerTrace } from "@server/debug/FocusedServerTrace.ts";
import type { Entity } from "@server/entities/Entity.ts";
import CollisionSystem from "@server/systems/CollisionSystem.ts";
import { DayNightSystem } from "@server/systems/DayNightSystem.ts";
import type { ExtractionSystem } from "@server/systems/ExtractionSystem.ts";
import type { InfrastructureSystem } from "@server/systems/InfrastructureSystem.ts";
import { PickupSystem } from "@server/systems/PickupSystem.ts";
import { WaveSystem } from "@server/systems/WaveSystem.ts";
import { EntityStore } from "@server/world/EntityStore.ts";
import { NavGridPathService } from "@server/world/NavGridPathService.ts";
import { SpatialIndex } from "@server/world/SpatialIndex.ts";
import { StaticGeometryIndex } from "@server/world/StaticGeometryIndex.ts";

export type WorldBenchmarkTickStats = {
  tick: number;
  totalMs: number;
  dayNightMs: number;
  waveMs: number;
  spatialBeforeMs: number;
  navDirtyMs: number;
  entityTickMs: number;
  enemyTickMs: number;
  collisionMs: number;
  afterMovementMs: number;
  pickupMs: number;
  spatialAfterMs: number;
  entityCount: number;
  enemyCount: number;
};

export type WorldBenchmarkSink = {
  recordWorldTick(stats: WorldBenchmarkTickStats): void;
};

const OUTER_PLAYER_BUILDING_LIFETIME_SECONDS = 5;

/**
 * Authoritative world container for entities, events, time, and shared world services.
 * This is the main state holder stepped by the server loop.
 */
export class World {
  public tick = 0;
  public simulationTimeMs = 0;
  public entities: EntityStore;
  public spatial: SpatialIndex;
  public staticGeometry: StaticGeometryIndex;
  public randomNumberGenerator: seedrandom.PRNG;
  public events: Denque<NetEvent>;
  public gameConfig: GameConfig;
  public dayNightSystem: DayNightSystem;
  public waveSystem: WaveSystem;
  public extractionSystem: ExtractionSystem | null = null;
  public infrastructureSystem: InfrastructureSystem | null = null;
  public proceduralLayout: ProceduralWorldLayout | null = null;
  public enemyCount = 0;
  public readonly navPathService: NavGridPathService;
  public readonly focusedTrace: FocusedServerTrace;
  public benchmarkSink?: WorldBenchmarkSink;
  public readonly dungeonRoomsByZone = new Map<
    string,
    Array<{
      id: string;
      roomType: string;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }>
  >();
  private readonly entityIdGenerator = new IdGenerator();
  private readonly collisionSystem = new CollisionSystem();
  private readonly pickupSystem = new PickupSystem();
  private readonly playerBuildingSpawnTickById = new Map<number, number>();
  private spatialDirty = true;

  /**
   * Creates a new world with deterministic RNG and empty state indexes.
   * @param gameConfig Runtime configuration shared with the server.
   */
  constructor(gameConfig: GameConfig) {
    this.gameConfig = gameConfig;
    this.entities = new EntityStore();
    this.spatial = new SpatialIndex(gameConfig.collision.spatialCellSize);
    this.staticGeometry = new StaticGeometryIndex(
      gameConfig.collision.spatialCellSize,
    );
    this.navPathService = new NavGridPathService(gameConfig.worldSize);
    this.randomNumberGenerator = seedrandom("1337");
    this.events = new Denque<NetEvent>();
    this.dayNightSystem = new DayNightSystem({
      tickRate: gameConfig.tickRate,
      dayDurationMs: gameConfig.dayNight.dayDurationMs,
      nightDurationMs: gameConfig.dayNight.nightDurationMs,
    });
    this.waveSystem = new WaveSystem({ dayNightSystem: this.dayNightSystem });
    this.focusedTrace = new FocusedServerTrace(gameConfig);
  }

  /**
   * Advances the world by one fixed simulation tick.
   */
  public step(): void {
    if (!this.benchmarkSink) {
      this.stepWithoutBenchmark();
      return;
    }

    const stepStartedAt = performance.now();
    this.tick += 1;
    const deltaMs = 1000 / this.gameConfig.tickRate;
    this.simulationTimeMs += deltaMs;
    this.focusedTrace.recordWorldPhase(this, "tick_start");
    const dayNightStartedAt = performance.now();
    this.dayNightSystem.update(this, deltaMs);
    const dayNightMs = performance.now() - dayNightStartedAt;
    const waveStartedAt = performance.now();
    this.waveSystem.update(this, deltaMs);
    this.extractionSystem?.update(this, deltaMs);
    this.infrastructureSystem?.update(this, deltaMs);
    const waveMs = performance.now() - waveStartedAt;

    const spatialBeforeStartedAt = performance.now();
    this.ensureSpatialIndex();
    const spatialBeforeMs = performance.now() - spatialBeforeStartedAt;
    const navDirtyStartedAt = performance.now();
    this.navPathService.updateDirty(this);
    const navDirtyMs = performance.now() - navDirtyStartedAt;
    const tickPhaseEntities = this.entities.all();
    const entityTickStartedAt = performance.now();
    let enemyTickMs = 0;
    let enemyCount = 0;
    for (const entity of tickPhaseEntities) {
      if (!this.entities.has(entity.id)) {
        continue;
      }
      const entityStartedAt = performance.now();
      entity.tick(this);
      const entityElapsedMs = performance.now() - entityStartedAt;
      if (entity.typeId.startsWith("enemy:")) {
        enemyCount += 1;
        enemyTickMs += entityElapsedMs;
      }
    }
    const entityTickMs = performance.now() - entityTickStartedAt;
    this.focusedTrace.recordWorldPhase(this, "after_entity_tick");

    const collisionStartedAt = performance.now();
    this.collisionSystem.integrateAndResolve(this, tickPhaseEntities);
    const collisionMs = performance.now() - collisionStartedAt;
    this.focusedTrace.recordWorldPhase(this, "after_collision");

    const afterMovementStartedAt = performance.now();
    for (const entity of this.entities.all()) {
      if (!this.entities.has(entity.id)) {
        continue;
      }
      entity.afterMovement(this);
    }
    const afterMovementMs = performance.now() - afterMovementStartedAt;
    this.focusedTrace.recordWorldPhase(this, "after_after_movement");

    const pickupStartedAt = performance.now();
    this.pickupSystem.update(this, deltaMs);
    const pickupMs = performance.now() - pickupStartedAt;
    this.expireOuterPlayerBuildings();
    const spatialAfterStartedAt = performance.now();
    this.ensureSpatialIndex();
    const spatialAfterMs = performance.now() - spatialAfterStartedAt;
    this.focusedTrace.recordWorldPhase(this, "tick_end");
    this.benchmarkSink?.recordWorldTick({
      tick: this.tick,
      totalMs: performance.now() - stepStartedAt,
      dayNightMs,
      waveMs,
      spatialBeforeMs,
      navDirtyMs,
      entityTickMs,
      enemyTickMs,
      collisionMs,
      afterMovementMs,
      pickupMs,
      spatialAfterMs,
      entityCount: tickPhaseEntities.length,
      enemyCount,
    });
  }

  private stepWithoutBenchmark(): void {
    this.tick += 1;
    const deltaMs = 1000 / this.gameConfig.tickRate;
    this.simulationTimeMs += deltaMs;
    this.focusedTrace.recordWorldPhase(this, "tick_start");
    this.dayNightSystem.update(this, deltaMs);
    this.waveSystem.update(this, deltaMs);
    this.extractionSystem?.update(this, deltaMs);
    this.infrastructureSystem?.update(this, deltaMs);

    this.ensureSpatialIndex();
    this.navPathService.updateDirty(this);
    const tickPhaseEntities = this.entities.all();
    for (const entity of tickPhaseEntities) {
      if (!this.entities.has(entity.id)) {
        continue;
      }
      entity.tick(this);
    }
    this.focusedTrace.recordWorldPhase(this, "after_entity_tick");

    this.collisionSystem.integrateAndResolve(this, tickPhaseEntities);
    this.focusedTrace.recordWorldPhase(this, "after_collision");

    for (const entity of this.entities.all()) {
      if (!this.entities.has(entity.id)) {
        continue;
      }
      entity.afterMovement(this);
    }
    this.focusedTrace.recordWorldPhase(this, "after_after_movement");

    this.pickupSystem.update(this, deltaMs);
    this.expireOuterPlayerBuildings();
    this.ensureSpatialIndex();
    this.focusedTrace.recordWorldPhase(this, "tick_end");
  }

  /**
   * Adds an entity to world storage.
   * @param entity Entity to spawn into the world.
   */
  public spawn(entity: Entity): void {
    this.entities.add(entity);
    if (isEnemyEntity(entity)) {
      this.enemyCount += 1;
    }
    if (isPlayerOwnedBuilding(entity)) {
      this.playerBuildingSpawnTickById.set(entity.id, this.tick);
    }
    this.navPathService.markEntityDirty(entity);
    this.markSpatialDirty();
  }

  /**
   * Removes an entity from world storage by id.
   * @param id Entity id to despawn.
   */
  public despawn(id: number): void {
    const entity = this.entities.get(id);
    if (entity) {
      this.navPathService.markEntityDirty(entity);
      if (isEnemyEntity(entity)) {
        this.enemyCount = Math.max(0, this.enemyCount - 1);
      }
    }
    this.entities.remove(id);
    this.playerBuildingSpawnTickById.delete(id);
    this.entityIdGenerator.free(id);
    this.markSpatialDirty();
  }

  /**
   * Resolves an entity by id with an optional caller-provided subtype.
   * @param id Entity id to look up.
   * @returns Matching entity when present.
   */
  public get<T extends Entity = Entity>(id: number): T | undefined {
    return this.entities.get<T>(id);
  }

  /**
   * Allocates a new authoritative runtime entity id.
   * @returns Newly allocated entity id.
   */
  public allocEntityId(): number {
    return this.entityIdGenerator.alloc();
  }

  public markSpatialDirty(): void {
    this.spatialDirty = true;
  }

  public ensureSpatialIndex(): void {
    if (!this.spatialDirty) {
      return;
    }
    this.spatial.sync(this.entities.all());
    this.staticGeometry.sync(this.entities.all());
    this.spatialDirty = false;
  }

  public registerDungeonRooms(
    zoneId: string,
    rooms: Array<{
      id: string;
      roomType: string;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }>,
  ): void {
    this.dungeonRoomsByZone.set(zoneId, rooms);
  }

  private expireOuterPlayerBuildings(): void {
    if (!this.proceduralLayout || this.playerBuildingSpawnTickById.size === 0) {
      return;
    }
    for (const [entityId, spawnTick] of [
      ...this.playerBuildingSpawnTickById.entries(),
    ]) {
      if (
        this.tick - spawnTick <
        OUTER_PLAYER_BUILDING_LIFETIME_SECONDS * this.gameConfig.tickRate
      ) {
        continue;
      }
      const entity = this.entities.get(entityId);
      if (!entity) {
        this.playerBuildingSpawnTickById.delete(entityId);
        continue;
      }
      const sector = getSectorForPoint(this.proceduralLayout, entity);
      if (sector?.allowsFastBuildingDecay) {
        this.despawn(entityId);
      }
    }
  }
}

function isEnemyEntity(entity: Entity): boolean {
  return entity.typeId.startsWith("enemy:");
}

function isPlayerOwnedBuilding(entity: Entity): boolean {
  return entity.typeId.startsWith("building:") && entity.ownerId !== undefined;
}
