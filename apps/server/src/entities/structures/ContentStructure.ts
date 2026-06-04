import { Structure } from "@server/entities/Structure.ts";
import type { RegistrableEntityCtor } from "@server/registry/registries.ts";

const structureCtorCache = new Map<string, RegistrableEntityCtor>();

/**
 * Shared runtime base for map-generated structures whose behavior comes from JSON.
 */
export class ContentStructure extends Structure {
  constructor(id: number) {
    super(id);
  }
}

export function createStructureCtor(
  resourceName: string,
): RegistrableEntityCtor {
  const cached = structureCtorCache.get(resourceName);
  if (cached) {
    return cached;
  }

  class GeneratedStructure extends ContentStructure {
    public static override readonly resourceName = resourceName;
  }

  structureCtorCache.set(resourceName, GeneratedStructure);
  return GeneratedStructure;
}
