import Denque from "denque";
import seedrandom from "seedrandom";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import type { DamageEventPayload, NetEvent } from "@shared/net/events.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
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
  }

  /**
   * Advances the world by one fixed simulation tick.
   */
  step(): void {
    this.tick += 1;
    const deltaSeconds = 1 / this.gameConfig.tickRate;
    for (const entity of this.entities.all()) {
      entity.tick(this);
      if (entity.collisionMode !== "static") {
        entity.x += entity.vx * deltaSeconds;
        entity.y += entity.vy * deltaSeconds;
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

  /**
   * Returns whether the source can deal damage to the target in this combat pass.
   * @param source Attacking entity.
   * @param target Potential target.
   * @returns True when the matchup is allowed.
   */
  canAttackTarget(source: Entity, target: Entity): boolean {
    if (!source.alive || !target.alive || source.id === target.id) {
      return false;
    }

    if (source instanceof Player) {
      return target instanceof Enemy || target instanceof Player;
    }
    if (source instanceof Enemy) {
      return target instanceof Player;
    }
    return false;
  }

  /**
   * Applies authoritative damage, emits an event, and handles death/respawn outcomes.
   * @param source Attacking entity.
   * @param target Damaged entity.
   * @param amount Positive damage amount.
   * @returns True when damage was applied.
   */
  applyDamage(
    source: Entity,
    target: Entity,
    amount: number,
  ): { applied: boolean; isFatal: boolean } {
    if (
      !this.canAttackTarget(source, target) ||
      target.hp === undefined ||
      target.maxHp === undefined ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return { applied: false, isFatal: false };
    }

    const nextHp = Math.max(0, Math.min(target.maxHp, target.hp - amount));
    if (nextHp === target.hp) {
      return { applied: false, isFatal: false };
    }

    target.hp = nextHp;
    const isFatal = nextHp <= 0;
    const damageEvent: NetEvent = {
      type: "damage",
      tick: this.tick + 1,
      payload: {
        sourceId: source.id,
        targetId: target.id,
        amount,
        remainingHp: nextHp,
        maxHp: target.maxHp,
        x: target.x,
        y: target.y,
        isFatal,
      } satisfies DamageEventPayload,
    };
    this.events.push(damageEvent);

    if (!isFatal) {
      return { applied: true, isFatal: false };
    }

    if (target instanceof Player) {
      target.hp = target.maxHp;
      target.x = this.gameConfig.worldSize.w / 2;
      target.y = this.gameConfig.worldSize.h / 2;
      target.resetVelocity();
      return { applied: true, isFatal: true };
    }

    if (target instanceof Enemy) {
      target.alive = false;
      this.despawn(target.id);
    }

    return { applied: true, isFatal: true };
  }
}
