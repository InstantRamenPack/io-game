import Denque from "denque";
import seedrandom from "seedrandom";
import { GameConfig } from "@shared/config/GameConfig.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { CombatSystem } from "@server/systems/CombatSystem.ts";
import { EntityStore } from "@server/world/EntityStore.ts";
import { SpatialIndex } from "@server/world/SpatialIndex.ts";

/**
 * Authoritative world container for entities, events, time, and shared world services.
 * This is the main state holder stepped by the server loop.
 */
export class World {
  tick = 0;
  entities: EntityStore;
  spatial: SpatialIndex;
  randomNumberGenerator: seedrandom.PRNG;
  events: Denque<NetEvent>;
  gameConfig: GameConfig;
  combat: CombatSystem;

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
    this.combat = new CombatSystem();
  }

  /**
   * Advances the world by one fixed simulation tick.
   */
  step(): void {
    this.tick += 1;
    for (const entity of this.entities.all()) {
      entity.tick(this);
      if (entity.collisionMode !== "static") {
        entity.x += entity.vx;
        entity.y += entity.vy;
      }
    }
  }

  /**
   * Adds an entity to world storage.
   * @param entity Entity to spawn into the world.
   */
  spawn(entity: Entity): void {
    this.entities.add(entity);
  }

  /**
   * Removes an entity from world storage by id.
   * @param id Entity id to despawn.
   */
  despawn(id: number): void {
    this.entities.remove(id);
  }

  /**
   * Resolves an entity by id with an optional caller-provided subtype.
   * @param id Entity id to look up.
   * @returns Matching entity when present.
   */
  get<T extends Entity = Entity>(id: number): T | undefined {
    return this.entities.get<T>(id);
  }
}
