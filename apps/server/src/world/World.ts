import Denque from "denque";
import seedrandom from "seedrandom";
import type { GameConfig } from "@shared/config/GameConfig.ts";
import {
  doResolvedRectSetsOverlap,
  getSweptResolvedRectSetIntersectionTime,
} from "@shared/geometry/collision.ts";
import {
  offsetHitboxBounds,
  resolveHitboxRects,
} from "@shared/geometry/hitbox.ts";
import { IdGenerator } from "@shared/math/IdGenerator.ts";
import type { NetEvent } from "@shared/net/events.ts";
import { FocusedServerTrace } from "@server/debug/FocusedServerTrace.ts";
import type { Entity } from "@server/entities/Entity.ts";
import CollisionSystem from "@server/systems/CollisionSystem.ts";
import { DayNightSystem } from "@server/systems/DayNightSystem.ts";
import { PickupSystem } from "@server/systems/PickupSystem.ts";
import { WaveSystem } from "@server/systems/WaveSystem.ts";
import { EntityStore } from "@server/world/EntityStore.ts";
import { NavGridPathService } from "@server/world/NavGridPathService.ts";
import { SpatialIndex } from "@server/world/SpatialIndex.ts";

/**
 * Authoritative world container for entities, events, time, and shared world services.
 * This is the main state holder stepped by the server loop.
 */
export class World {
  public tick = 0;
  public simulationTimeMs = 0;
  public entities: EntityStore;
  public spatial: SpatialIndex;
  public randomNumberGenerator: seedrandom.PRNG;
  public events: Denque<NetEvent>;
  public gameConfig: GameConfig;
  public dayNightSystem: DayNightSystem;
  public waveSystem: WaveSystem;
  public readonly navPathService: NavGridPathService;
  public readonly focusedTrace: FocusedServerTrace;
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
  private readonly lastIntegratedPositions = new Map<
    number,
    { x: number; y: number }
  >();
  private spatialDirty = true;
  private static readonly SWEEP_SKIN = 0.001;
  private static readonly SWEEP_TOUCH_EPSILON = 0.01;

  /**
   * Creates a new world with deterministic RNG and empty state indexes.
   * @param gameConfig Runtime configuration shared with the server.
   */
  constructor(gameConfig: GameConfig) {
    this.gameConfig = gameConfig;
    this.entities = new EntityStore();
    this.spatial = new SpatialIndex(gameConfig.collision.spatialCellSize);
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
    this.tick += 1;
    const deltaMs = 1000 / this.gameConfig.tickRate;
    this.simulationTimeMs += deltaMs;
    this.focusedTrace.recordWorldPhase(this, "tick_start");
    this.dayNightSystem.update(this, deltaMs);
    this.waveSystem.update(this, deltaMs);

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

    let movedEntity = false;
    this.lastIntegratedPositions.clear();
    for (const entity of tickPhaseEntities) {
      if (!this.entities.has(entity.id) || entity.collisionMode === "static") {
        continue;
      }
      if (entity.vx !== 0 || entity.vy !== 0) {
        movedEntity = true;
      }
      this.integrateEntityWithSweptClamp(entity);
    }
    if (movedEntity) {
      this.markSpatialDirty();
    }
    this.focusedTrace.recordWorldPhase(this, "after_integrate");

    this.ensureSpatialIndex();

    this.collisionSystem.update(this);
    this.focusedTrace.recordWorldPhase(this, "after_collision");

    for (const entity of this.entities.all()) {
      if (!this.entities.has(entity.id)) {
        continue;
      }
      entity.afterMovement(this);
    }
    this.focusedTrace.recordWorldPhase(this, "after_after_movement");

    this.pickupSystem.update(this, deltaMs);
    this.ensureSpatialIndex();
    this.focusedTrace.recordWorldPhase(this, "tick_end");
  }

  /**
   * Adds an entity to world storage.
   * @param entity Entity to spawn into the world.
   */
  public spawn(entity: Entity): void {
    this.entities.add(entity);
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
    }
    this.entities.remove(id);
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
    this.spatialDirty = false;
  }

  public getLastIntegratedPosition(
    entity: Entity,
  ): { x: number; y: number } | null {
    return this.lastIntegratedPositions.get(entity.id) ?? null;
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

  private integrateEntityWithSweptClamp(entity: Entity): void {
    const deltaX = entity.vx;
    const deltaY = entity.vy;
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    this.lastIntegratedPositions.set(entity.id, { x: entity.x, y: entity.y });
    const fromX = entity.x;
    const fromY = entity.y;
    let nextX = fromX;
    let nextY = fromY;
    const resolvedDeltaX = this.resolveSweptAxisDelta(
      entity,
      nextX,
      nextY,
      deltaX,
      0,
    );
    nextX += resolvedDeltaX;
    const resolvedDeltaY = this.resolveSweptAxisDelta(
      entity,
      nextX,
      nextY,
      0,
      deltaY,
    );
    nextY += resolvedDeltaY;
    const diagonalClamped = this.resolveDiagonalCornerClamp(
      entity,
      fromX,
      fromY,
      nextX,
      nextY,
    );
    nextX = diagonalClamped.x;
    nextY = diagonalClamped.y;
    entity.x = nextX;
    entity.y = nextY;
    if (resolvedDeltaX !== deltaX || nextX !== fromX + resolvedDeltaX) {
      entity.clipVelocityAgainstNormal({ x: Math.sign(deltaX), y: 0 });
    }
    if (resolvedDeltaY !== deltaY || nextY !== fromY + resolvedDeltaY) {
      entity.clipVelocityAgainstNormal({ x: 0, y: Math.sign(deltaY) });
    }
  }

  private resolveDiagonalCornerClamp(
    entity: Entity,
    fromX: number,
    fromY: number,
    targetX: number,
    targetY: number,
  ): { x: number; y: number } {
    const deltaX = targetX - fromX;
    const deltaY = targetY - fromY;
    if (deltaX === 0 || deltaY === 0) {
      return { x: targetX, y: targetY };
    }

    const currentBounds = offsetHitboxBounds(
      entity.getHitboxBounds(),
      fromX,
      fromY,
    );
    const nextBounds = offsetHitboxBounds(
      entity.getHitboxBounds(),
      targetX,
      targetY,
    );
    const candidates = this.spatial
      .queryBox(
        Math.min(currentBounds.minX, nextBounds.minX),
        Math.min(currentBounds.minY, nextBounds.minY),
        Math.max(currentBounds.maxX, nextBounds.maxX),
        Math.max(currentBounds.maxY, nextBounds.maxY),
      )
      .filter(
        (candidate) =>
          candidate.id !== entity.id &&
          candidate.collisionMode === "static" &&
          candidate.alive,
      );
    if (candidates.length === 0) {
      return { x: targetX, y: targetY };
    }

    const movingHitboxes = resolveHitboxRects(fromX, fromY, entity.hitboxes);
    let earliestHitTime: number | null = null;
    for (const candidate of candidates) {
      const hitTime = getSweptResolvedRectSetIntersectionTime(
        movingHitboxes,
        deltaX,
        deltaY,
        candidate.getWorldHitboxes(),
      );
      if (hitTime === null) {
        continue;
      }
      if (earliestHitTime === null || hitTime < earliestHitTime) {
        earliestHitTime = hitTime;
      }
    }

    if (earliestHitTime === null || earliestHitTime >= 1) {
      return { x: targetX, y: targetY };
    }

    const safeHitTime = Math.max(
      0,
      Math.min(1, earliestHitTime - World.SWEEP_SKIN),
    );
    return {
      x: fromX + deltaX * safeHitTime,
      y: fromY + deltaY * safeHitTime,
    };
  }

  private resolveSweptAxisDelta(
    entity: Entity,
    fromX: number,
    fromY: number,
    deltaX: number,
    deltaY: number,
  ): number {
    if (deltaX === 0 && deltaY === 0) {
      return 0;
    }

    const currentBounds = offsetHitboxBounds(
      entity.getHitboxBounds(),
      fromX,
      fromY,
    );
    const nextBounds = offsetHitboxBounds(
      entity.getHitboxBounds(),
      fromX + deltaX,
      fromY + deltaY,
    );
    const minX = Math.min(currentBounds.minX, nextBounds.minX);
    const minY = Math.min(currentBounds.minY, nextBounds.minY);
    const maxX = Math.max(currentBounds.maxX, nextBounds.maxX);
    const maxY = Math.max(currentBounds.maxY, nextBounds.maxY);

    const candidates = this.spatial
      .queryBox(minX, minY, maxX, maxY)
      .filter(
        (candidate) =>
          candidate.id !== entity.id &&
          candidate.collisionMode === "static" &&
          candidate.alive,
      );
    if (candidates.length === 0) {
      return deltaX !== 0 ? deltaX : deltaY;
    }

    const movingHitboxes = resolveHitboxRects(fromX, fromY, entity.hitboxes);
    let earliestHitTime: number | null = null;
    for (const candidate of candidates) {
      const hitTime = getSweptResolvedRectSetIntersectionTime(
        movingHitboxes,
        deltaX,
        deltaY,
        candidate.getWorldHitboxes(),
      );
      if (hitTime === null) {
        continue;
      }
      if (earliestHitTime === null || hitTime < earliestHitTime) {
        earliestHitTime = hitTime;
      }
    }

    if (earliestHitTime === null) {
      return deltaX !== 0 ? deltaX : deltaY;
    }

    if (earliestHitTime <= World.SWEEP_TOUCH_EPSILON) {
      const endHitboxes = resolveHitboxRects(
        fromX + deltaX,
        fromY + deltaY,
        entity.hitboxes,
      );
      const overlaps = candidates.some((candidate) =>
        doResolvedRectSetsOverlap(endHitboxes, candidate.getWorldHitboxes()),
      );
      if (!overlaps) {
        return deltaX !== 0 ? deltaX : deltaY;
      }
    }

    const safeHitTime = Math.max(
      0,
      Math.min(1, earliestHitTime - World.SWEEP_SKIN),
    );
    return (deltaX !== 0 ? deltaX : deltaY) * safeHitTime;
  }
}
