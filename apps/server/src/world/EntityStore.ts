import type { EntityKind } from "@shared/ids/EntityKinds.ts";
import type { Entity } from "@server/entities/Entity.ts";

/**
 * Indexes entities by id and kind for fast lookup and filtered queries.
 * World owns one EntityStore for its authoritative entities.
 */
export class EntityStore {
  byId = new Map<number, Entity>();
  byKind = new Map<EntityKind, Set<number>>();

  /**
   * Inserts an entity and updates the secondary kind index.
   * @param entity Entity to add.
   */
  add(entity: Entity): void {
    this.byId.set(entity.id, entity);
    let entityIdsByKind = this.byKind.get(entity.kind);
    if (!entityIdsByKind) {
      entityIdsByKind = new Set<number>();
      this.byKind.set(entity.kind, entityIdsByKind);
    }
    entityIdsByKind.add(entity.id);
  }

  /**
   * Removes an entity and cleans up its kind index membership.
   * @param id Entity id to remove.
   */
  remove(id: number): void {
    const entity = this.byId.get(id);
    if (!entity) {
      return;
    }
    this.byId.delete(id);
    this.byKind.get(entity.kind)?.delete(id);
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
   * Returns all entities matching a specific kind.
   * @param kind Entity kind to filter by.
   * @returns Entities that currently belong to the requested kind.
   */
  queryKind(kind: EntityKind): Entity[] {
    const entityIdsForKind = this.byKind.get(kind);
    if (!entityIdsForKind) {
      return [];
    }
    const matchingEntities: Entity[] = [];
    for (const entityId of entityIdsForKind) {
      const entity = this.byId.get(entityId);
      if (entity) {
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
