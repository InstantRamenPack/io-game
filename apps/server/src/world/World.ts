import Denque from "denque";
import seedrandom from "seedrandom";
import type { GameConfig } from "@shared/config/GameConfig.ts";
import { IdGenerator } from "@shared/math/IdGenerator.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { CollisionSystem } from "@server/systems/CollisionSystem.ts";
import { DayNightSystem } from "@server/systems/DayNightSystem.ts";
import { EntityStore } from "@server/world/EntityStore.ts";
import { SpatialIndex } from "@server/world/SpatialIndex.ts";

/**
 * Authoritative world container for entities, events, time, and shared world services.
 * This is the main state holder stepped by the server loop.
 */
export class World {
  public tick = 0;
  public entities: EntityStore;
  public spatial: SpatialIndex;
  public randomNumberGenerator: seedrandom.PRNG;
  public events: Denque<NetEvent>;
  public gameConfig: GameConfig;
  public dayNightSystem: DayNightSystem;
  private readonly entityIdGenerator = new IdGenerator();
  private readonly collisionSystem = new CollisionSystem();

  /**
   * Creates a new world with deterministic RNG and empty state indexes.
   * @param gameConfig Runtime configuration shared with the server.
   */
  constructor(gameConfig: GameConfig) {
    this.gameConfig = gameConfig;
    this.entities = new EntityStore();
    this.spatial = new SpatialIndex(gameConfig.collision.spatialCellSize);
    this.randomNumberGenerator = seedrandom("1337");
    this.events = new Denque<NetEvent>();
    this.dayNightSystem = new DayNightSystem({
      tickRate: gameConfig.tickRate,
      dayDurationMs: gameConfig.dayNight.dayDurationMs,
      nightDurationMs: gameConfig.dayNight.nightDurationMs,
    });
  }

  /**
   * Advances the world by one fixed simulation tick.
   */
  public step(): void {
    this.tick += 1;
    const deltaMs = 1000 / this.gameConfig.tickRate;
    this.dayNightSystem.update(this, deltaMs);

    this.syncSpatialIndex();
    const tickPhaseEntities = this.entities.all();
    for (const entity of tickPhaseEntities) {
      if (!this.entities.has(entity.id)) {
        continue;
      }
      entity.tick(this);
    }

    for (const entity of tickPhaseEntities) {
      if (!this.entities.has(entity.id) || entity.collisionMode === "static") {
        continue;
      }
      entity.x += entity.vx;
      entity.y += entity.vy;
    }

    this.syncSpatialIndex();
    this.collisionSystem.update(this);
    this.syncSpatialIndex();

    for (const entity of this.entities.all()) {
      if (!this.entities.has(entity.id)) {
        continue;
      }
      entity.afterMovement(this);
    }
  }

  /**
   * Adds an entity to world storage.
   * @param entity Entity to spawn into the world.
   */
  public spawn(entity: Entity): void {
    this.entities.add(entity);
  }

  /**
   * Removes an entity from world storage by id.
   * @param id Entity id to despawn.
   */
  public despawn(id: number): void {
    this.entities.remove(id);
    this.entityIdGenerator.free(id);
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

  private syncSpatialIndex(): void {
    this.spatial.rebuild(this.entities.collidable());
  }
}
