import type { Entity } from "@server/entities/Entity.ts";

type EntityInstanceCtor<T extends Entity> = abstract new (
  ...args: never[]
) => T;

/**
 * Indexes entities by id for fast lookup and instance-based queries.
 * World owns one EntityStore for its authoritative entities.
 */
export class EntityStore {
  byId = new Map<number, Entity>();
  private allCache?: readonly Entity[];
  private dynamicCache?: readonly Entity[];
  private collidableCache?: readonly Entity[];
  private nonCollidableCache?: readonly Entity[];

  /**
   * Inserts an entity into the primary id index.
   * @param entity Entity to add.
   */
  add(entity: Entity): void {
    this.byId.set(entity.id, entity);
    this.invalidateViews();
  }

  /**
   * Removes an entity from the primary id index.
   * @param id Entity id to remove.
   */
  remove(id: number): void {
    if (this.byId.delete(id)) {
      this.invalidateViews();
    }
  }

  /**
   * Returns an entity by id, optionally typed by the caller.
   * @param id Entity id to resolve.
   * @returns Matching entity when present.
   */
  get<T extends Entity = Entity>(id: number): T | undefined {
    return this.byId.get(id) as T | undefined;
  }

  has(id: number): boolean {
    return this.byId.has(id);
  }

  /**
   * Returns all entities matching a specific runtime class.
   * @param ctor Entity constructor to filter by.
   * @returns Entities that are instances of the requested constructor.
   */
  queryInstances<T extends Entity>(ctor: EntityInstanceCtor<T>): T[] {
    const matchingEntities: T[] = [];
    for (const entity of this.byId.values()) {
      if (entity instanceof ctor) {
        matchingEntities.push(entity);
      }
    }
    return matchingEntities;
  }

  /**
   * Returns all stored entities.
   * @returns Snapshot of the current entity collection.
   */
  all(): Entity[] {
    if (!this.allCache) {
      this.allCache = [...this.byId.values()];
    }
    return this.allCache as Entity[];
  }

  dynamic(): Entity[] {
    if (!this.dynamicCache) {
      this.dynamicCache = this.all().filter(
        (entity) => entity.collisionMode === "dynamic",
      );
    }
    return this.dynamicCache as Entity[];
  }

  collidable(): Entity[] {
    if (!this.collidableCache) {
      this.collidableCache = this.all().filter(
        (entity) => entity.collisionMode !== "none",
      );
    }
    return this.collidableCache as Entity[];
  }

  nonCollidable(): Entity[] {
    if (!this.nonCollidableCache) {
      this.nonCollidableCache = this.all().filter(
        (entity) => entity.collisionMode === "none",
      );
    }
    return this.nonCollidableCache as Entity[];
  }

  private invalidateViews(): void {
    this.allCache = undefined;
    this.dynamicCache = undefined;
    this.collidableCache = undefined;
    this.nonCollidableCache = undefined;
  }
}
