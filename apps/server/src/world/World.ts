import Denque from "denque";
import seedrandom from "seedrandom";
import type { GameConfig } from "@shared/config/GameConfig.ts";
import { IdGenerator } from "@shared/math/IdGenerator.ts";
import type { NetEvent } from "@shared/net/events.ts";
import {
  getSectorForPoint,
  type ProceduralForestCamp,
  type ProceduralWorldLayout,
} from "@shared/world/ProceduralWorld.ts";
import { FocusedServerTrace } from "@server/debug/FocusedServerTrace.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import { isSpawnableEntityCtor } from "@server/runtime/ctorGuards.ts";
import CollisionSystem from "@server/systems/CollisionSystem.ts";
import { DayNightSystem } from "@server/systems/DayNightSystem.ts";
import type { ExtractionSystem } from "@server/systems/ExtractionSystem.ts";
import type { InfrastructureSystem } from "@server/systems/InfrastructureSystem.ts";
import { NightStormSystem } from "@server/systems/NightStormSystem.ts";
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

const OUTER_PLAYER_BUILDING_DECAY_SECONDS = 20;

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
  public nightStormSystem: NightStormSystem;
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
  private readonly nextForestCampRespawnTickById = new Map<string, number>();
  private spatialDirty = true;

  /**
   * Creates a new world with deterministic RNG and empty state indexes.
   * @param gameConfig Runtime configuration shared with the server.
   * @param randomSeed Seed for random events.
   */
  constructor(gameConfig: GameConfig, randomSeed: string | number = 1337) {
    this.gameConfig = gameConfig;
    this.entities = new EntityStore();
    this.spatial = new SpatialIndex(gameConfig.collision.spatialCellSize);
    this.staticGeometry = new StaticGeometryIndex(
      gameConfig.collision.spatialCellSize,
    );
    this.navPathService = new NavGridPathService(gameConfig.worldSize);
    this.randomNumberGenerator = seedrandom(String(randomSeed));
    this.events = new Denque<NetEvent>();
    this.dayNightSystem = new DayNightSystem({
      tickRate: gameConfig.tickRate,
      dayDurationMs: gameConfig.dayNight.dayDurationMs,
      nightDurationMs: gameConfig.dayNight.nightDurationMs,
    });
    this.nightStormSystem = new NightStormSystem({
      tickRate: gameConfig.tickRate,
      damage: gameConfig.dayNight.stormDamage.damage,
      intervalMs: gameConfig.dayNight.stormDamage.intervalMs,
    });
    this.waveSystem = new WaveSystem({ dayNightSystem: this.dayNightSystem });
    this.focusedTrace = new FocusedServerTrace(gameConfig);
  }

  /**
   * Advances the world by one fixed simulation tick.
   */
  public step(): void {
    const benchmarkSink = this.benchmarkSink;
    const stepStartedAt = benchmarkSink ? performance.now() : 0;
    const measurePhase = (phase: () => void): number => {
      if (!benchmarkSink) {
        phase();
        return 0;
      }
      const phaseStartedAt = performance.now();
      phase();
      return performance.now() - phaseStartedAt;
    };

    this.tick += 1;
    const deltaMs = 1000 / this.gameConfig.tickRate;
    this.simulationTimeMs += deltaMs;
    this.focusedTrace.recordWorldPhase(this, "tick_start");

    const dayNightMs = measurePhase(() => {
      this.dayNightSystem.update(this, deltaMs);
    });
    const waveMs = measurePhase(() => {
      this.waveSystem.update(this, deltaMs);
      this.nightStormSystem.update(this, deltaMs);
      this.updateForestCampRespawns();
      this.infrastructureSystem?.update(this, deltaMs);
      this.extractionSystem?.update(this, deltaMs);
    });
    const spatialBeforeMs = measurePhase(() => {
      this.ensureSpatialIndex();
    });
    const navDirtyMs = measurePhase(() => {
      this.navPathService.updateDirty(this);
    });

    const tickPhaseEntities = this.entities.all();
    let enemyTickMs = 0;
    let enemyCount = 0;
    const entityTickMs = measurePhase(() => {
      for (const entity of tickPhaseEntities) {
        if (!this.entities.has(entity.id)) {
          continue;
        }
        const isEnemy = entity.typeId.startsWith("enemy:");
        const entityStartedAt =
          benchmarkSink && isEnemy ? performance.now() : 0;
        entity.tick(this);
        if (isEnemy) {
          enemyCount += 1;
          if (benchmarkSink) {
            enemyTickMs += performance.now() - entityStartedAt;
          }
        }
      }
    });
    this.focusedTrace.recordWorldPhase(this, "after_entity_tick");

    const collisionMs = measurePhase(() => {
      this.collisionSystem.integrateAndResolve(this, tickPhaseEntities);
    });
    this.focusedTrace.recordWorldPhase(this, "after_collision");

    const afterMovementMs = measurePhase(() => {
      for (const entity of this.entities.all()) {
        if (!this.entities.has(entity.id)) {
          continue;
        }
        entity.afterMovement(this);
      }
    });
    this.focusedTrace.recordWorldPhase(this, "after_after_movement");

    const pickupMs = measurePhase(() => {
      this.pickupSystem.update(this, deltaMs);
    });
    this.decayOuterPlayerBuildings(deltaMs);
    const spatialAfterMs = measurePhase(() => {
      this.ensureSpatialIndex();
    });
    this.focusedTrace.recordWorldPhase(this, "tick_end");

    benchmarkSink?.recordWorldTick({
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

  public initializeForestCampRespawns(
    camps: readonly ProceduralForestCamp[],
  ): void {
    this.nextForestCampRespawnTickById.clear();
    for (const camp of camps) {
      const jitter = Math.floor(
        this.randomNumberGenerator() * camp.respawnDelayTicks,
      );
      this.nextForestCampRespawnTickById.set(
        camp.id,
        this.tick + camp.respawnDelayTicks + jitter,
      );
    }
  }

  private updateForestCampRespawns(): void {
    const camps = this.proceduralLayout?.forestCamps;
    if (!camps || camps.length === 0 || !this.dayNightSystem.isNight()) {
      return;
    }
    for (const camp of camps) {
      const nextTick =
        this.nextForestCampRespawnTickById.get(camp.id) ??
        this.tick + camp.respawnDelayTicks;
      if (this.tick < nextTick) {
        continue;
      }
      this.nextForestCampRespawnTickById.set(
        camp.id,
        this.tick + camp.respawnDelayTicks,
      );
      const alive = this.countAliveEnemiesInCamp(camp);
      if (alive >= camp.maxAlive || this.randomNumberGenerator() > 0.55) {
        continue;
      }
      this.spawnForestCampEnemy(camp);
    }
  }

  private countAliveEnemiesInCamp(camp: ProceduralForestCamp): number {
    let count = 0;
    const radiusSquared = camp.radius * camp.radius;
    for (const entity of this.entities.all()) {
      if (!(entity instanceof Enemy) || !entity.alive) {
        continue;
      }
      const dx = entity.x - camp.x;
      const dy = entity.y - camp.y;
      if (dx * dx + dy * dy <= radiusSquared) {
        count += 1;
      }
    }
    return count;
  }

  private spawnForestCampEnemy(camp: ProceduralForestCamp): void {
    const typeId =
      camp.enemyTypes[
        Math.floor(this.randomNumberGenerator() * camp.enemyTypes.length)
      ];
    if (!typeId) {
      return;
    }
    const entry = entityTypeRegistry.require(typeId);
    if (!isSpawnableEntityCtor(entry.ctor)) {
      throw new Error(`Forest camp type ${typeId} is not spawnable.`);
    }
    const entity = new entry.ctor(this.allocEntityId());
    const angle = this.randomNumberGenerator() * Math.PI * 2;
    const radius = this.randomNumberGenerator() * camp.radius * 0.75;
    entity.x = Math.max(
      0,
      Math.min(camp.x + Math.cos(angle) * radius, this.gameConfig.worldSize.w),
    );
    entity.y = Math.max(
      0,
      Math.min(camp.y + Math.sin(angle) * radius, this.gameConfig.worldSize.h),
    );
    this.spawn(entity);
  }

  private decayOuterPlayerBuildings(deltaMs: number): void {
    if (!this.proceduralLayout || this.playerBuildingSpawnTickById.size === 0) {
      return;
    }
    for (const entityId of [...this.playerBuildingSpawnTickById.keys()]) {
      const entity = this.entities.get(entityId);
      if (!entity) {
        this.playerBuildingSpawnTickById.delete(entityId);
        continue;
      }
      const sector = getSectorForPoint(this.proceduralLayout, entity);
      if (sector?.allowsFastBuildingDecay) {
        const decayDamage =
          (entity.maxHp * deltaMs) /
          (OUTER_PLAYER_BUILDING_DECAY_SECONDS * 1000);
        entity.applyDamage(this, decayDamage, 0);
      } else {
        this.playerBuildingSpawnTickById.delete(entityId);
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
