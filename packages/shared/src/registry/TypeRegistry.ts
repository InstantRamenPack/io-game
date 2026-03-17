import { assertResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Minimal registry keyed by stable resource ids.
 * Registries are writable during bootstrap and read-only after freeze.
 */
export class TypeRegistry<T> {
  private readonly valuesById = new Map<ResourceId, T>();
  private frozen = false;

  register(typeId: ResourceId, value: T): void {
    if (this.frozen) {
      throw new Error("Cannot register new entries after registry freeze.");
    }

    const normalizedTypeId = assertResourceId(typeId);
    if (this.valuesById.has(normalizedTypeId)) {
      throw new Error(`Duplicate type id registration: ${normalizedTypeId}`);
    }

    this.valuesById.set(normalizedTypeId, value);
  }

  freeze(): void {
    this.frozen = true;
  }

  has(typeId: ResourceId): boolean {
    return this.valuesById.has(typeId);
  }

  get(typeId: ResourceId): T | undefined {
    return this.valuesById.get(typeId);
  }

  require(typeId: ResourceId): T {
    const value = this.valuesById.get(typeId);
    if (value === undefined) {
      throw new Error(`Unknown type id: ${typeId}`);
    }
    return value;
  }

  entries(): IterableIterator<[ResourceId, T]> {
    return this.valuesById.entries();
  }

  ids(): IterableIterator<ResourceId> {
    return this.valuesById.keys();
  }
}
