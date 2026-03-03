import Denque from "denque";
import seedrandom from "seedrandom";
import { GameConfig } from "@shared/config/GameConfig.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { EntityStore } from "@server/world/EntityStore.ts";

/** Authoritative world container for entities, events, and time. */
export class World {
  tick = 0;
  timeMs = 0;
  entities: EntityStore;
  spatial: { update: () => void };
  randomNumberGenerator: seedrandom.PRNG;
  events: Denque<NetEvent>;
  gameConfig: GameConfig;

  /** Creates a new world with deterministic RNG and empty state indexes. */
  constructor(gameConfig: GameConfig) {
    this.gameConfig = gameConfig;
    this.entities = new EntityStore();
    this.spatial = { update: () => {} };
    this.randomNumberGenerator = seedrandom("1337");
    this.events = new Denque<NetEvent>();
  }

  /** Advances world time and applies entity velocity integration. */
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

  /** Adds an entity to world storage. */
  spawn(entity: Entity): void {
    this.entities.add(entity);
  }

  /** Removes an entity from world storage by ID. */
  despawn(id: number): void {
    this.entities.remove(id);
  }

  /** Resolves an entity by ID with optional caller-provided subtype. */
  get<T extends Entity = Entity>(id: number): T | undefined {
    return this.entities.get<T>(id);
  }
}
