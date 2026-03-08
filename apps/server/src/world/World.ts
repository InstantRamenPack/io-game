import Denque from "denque";
import seedrandom from "seedrandom";
import { GameConfig } from "@shared/config/GameConfig.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { EntityStore } from "@server/world/EntityStore.ts";

/**
 * Authoritative world container for entities, events, time, and shared world services.
 * This is the main state holder stepped by the server loop.
 */
export class World {
  tick = 0;
  timeMs = 0;
  entities: EntityStore;
  spatial: { update: () => void };
  randomNumberGenerator: seedrandom.PRNG;
  events: Denque<NetEvent>;
  gameConfig: GameConfig;

  /**
   * Creates a new world with deterministic RNG and empty state indexes.
   * @param gameConfig Runtime configuration shared with the server.
   */
  constructor(gameConfig: GameConfig) {
    this.gameConfig = gameConfig;
    this.entities = new EntityStore();
    this.spatial = { update: () => {} };
    this.randomNumberGenerator = seedrandom("1337");
    this.events = new Denque<NetEvent>();
  }

  /**
   * Advances world time and applies the base entity update/integration pass.
   * @param deltaMs Fixed or measured tick delta in milliseconds.
   */
  step(deltaMs: number): void {
    this.tick += 1;
    this.timeMs += deltaMs;

    const deltaSeconds = deltaMs / 1000;
    for (const entity of this.entities.all()) {
      entity.tick(this, deltaMs);
      entity.x += entity.vx * deltaSeconds;
      entity.y += entity.vy * deltaSeconds;
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
