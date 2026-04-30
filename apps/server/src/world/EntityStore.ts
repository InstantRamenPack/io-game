import type { Entity } from "@server/entities/Entity.ts";

type EntityInstanceCtor<T extends Entity> = abstract new (
  ...args: never[]
) => T;

/**
 * Indexes entities by id for fast lookup and instance-based queries.
 * World owns one EntityStore for its authoritative entities.
 */
export class EntityStore {
  public byId = new Map<number, Entity>();
  private allCache?: Entity[];
  private dynamicCache?: Entity[];
  private collidableCache?: Entity[];
  private nonCollidableCache?: Entity[];
  private readonly queryInstancesCache = new Map<
    EntityInstanceCtor<Entity>,
    Entity[]
  >();

  /**
   * Inserts an entity into the primary id index.
   * @param entity Entity to add.
   */
  public add(entity: Entity): void {
    this.byId.set(entity.id, entity);
    this.invalidateViews();
  }

  /**
   * Removes an entity from the primary id index.
   * @param id Entity id to remove.
   */
  public remove(id: number): void {
    if (this.byId.delete(id)) {
      this.invalidateViews();
    }
  }

  /**
   * Returns an entity by id, optionally typed by the caller.
   * @param id Entity id to resolve.
   * @returns Matching entity when present.
   */
  public get<T extends Entity = Entity>(id: number): T | undefined {
    return this.byId.get(id) as T | undefined;
  }

  public has(id: number): boolean {
    return this.byId.has(id);
  }

  /**
   * Returns all entities matching a specific runtime class.
   * @param ctor Entity constructor to filter by.
   * @returns Entities that are instances of the requested constructor.
   */
  public queryInstances<T extends Entity>(ctor: EntityInstanceCtor<T>): T[] {
    const cached = this.queryInstancesCache.get(
      ctor as EntityInstanceCtor<Entity>,
    );
    if (cached) {
      return cached as T[];
    }

    const matchingEntities: T[] = [];
    for (const entity of this.byId.values()) {
      if (entity instanceof ctor) {
        matchingEntities.push(entity);
      }
    }
    this.queryInstancesCache.set(
      ctor as EntityInstanceCtor<Entity>,
      matchingEntities as Entity[],
    );
    return matchingEntities;
  }

  public countInstances<T extends Entity>(ctor: EntityInstanceCtor<T>): number {
    return this.queryInstances(ctor).length;
  }

  /**
   * Returns all stored entities.
   * @returns Snapshot of the current entity collection.
   */
  public all(): Entity[] {
    if (!this.allCache) {
      this.allCache = [...this.byId.values()];
    }
    return this.allCache;
  }

  public dynamic(): Entity[] {
    if (!this.dynamicCache) {
      this.dynamicCache = this.all().filter(
        (entity) => entity.collisionMode === "dynamic",
      );
    }
    return this.dynamicCache;
  }

  public collidable(): Entity[] {
    if (!this.collidableCache) {
      this.collidableCache = this.all().filter(
        (entity) => entity.collisionMode !== "none",
      );
    }
    return this.collidableCache;
  }

  public nonCollidable(): Entity[] {
    if (!this.nonCollidableCache) {
      this.nonCollidableCache = this.all().filter(
        (entity) => entity.collisionMode === "none",
      );
    }
    return this.nonCollidableCache;
  }

  private invalidateViews(): void {
    this.allCache = undefined;
    this.dynamicCache = undefined;
    this.collidableCache = undefined;
    this.nonCollidableCache = undefined;
    this.queryInstancesCache.clear();
  }
}
