import type { Entity } from "@server/entities/Entity.ts";

type EntityInstanceCtor<T extends Entity> = abstract new (...args: any[]) => T;

/**
 * Indexes entities by id for fast lookup and instance-based queries.
 * World owns one EntityStore for its authoritative entities.
 */
export class EntityStore {
  byId = new Map<number, Entity>();

  /**
   * Inserts an entity into the primary id index.
   * @param entity Entity to add.
   */
  add(entity: Entity): void {
    this.byId.set(entity.id, entity);
  }

  /**
   * Removes an entity from the primary id index.
   * @param id Entity id to remove.
   */
  remove(id: number): void {
    this.byId.delete(id);
  }

  /**
   * Returns an entity by id, optionally typed by the caller.
   * @param id Entity id to resolve.
   * @returns Matching entity when present.
   */
  get<T extends Entity = Entity>(id: number): T | undefined {
    return this.byId.get(id) as T | undefined;
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
    return [...this.byId.values()];
  }
}
