import { assertResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Minimal registry keyed by stable resource ids.
 * Registries are writable during bootstrap and read-only after freeze.
 */
export class TypeRegistry<T extends { readonly typeId: ResourceId }> {
  private readonly valuesById = new Map<ResourceId, T>();
  private frozen = false;

  public register(typeId: ResourceId, value: T): void {
    if (this.frozen) {
      throw new Error("Cannot register new entries after registry freeze.");
    }

    const normalizedTypeId = assertResourceId(typeId);
    if (this.valuesById.has(normalizedTypeId)) {
      throw new Error(`Duplicate type id registration: ${normalizedTypeId}`);
    }

    this.valuesById.set(normalizedTypeId, value);
  }

  public registerAll(entries: Iterable<T>): void {
    for (const entry of entries) {
      this.register(entry.typeId, entry);
    }
  }

  public freeze(): void {
    this.frozen = true;
  }

  public has(typeId: ResourceId): boolean {
    return this.valuesById.has(typeId);
  }

  public get(typeId: ResourceId): T | undefined {
    return this.valuesById.get(typeId);
  }

  public require(typeId: ResourceId): T {
    const value = this.valuesById.get(typeId);
    if (value === undefined) {
      throw new Error(`Unknown type id: ${typeId}`);
    }
    return value;
  }

  public entries(): IterableIterator<[ResourceId, T]> {
    return this.valuesById.entries();
  }

  public ids(): IterableIterator<ResourceId> {
    return this.valuesById.keys();
  }
}
