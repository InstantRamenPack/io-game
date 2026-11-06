import { Structure } from "@server/entities/Structure.ts";
import type { RegistrableEntityCtor } from "@server/registry/registries.ts";

const structureCtorCache = new Map<string, RegistrableEntityCtor>();

export function createStructureCtor(
  resourceName: string,
): RegistrableEntityCtor {
  const cached = structureCtorCache.get(resourceName);
  if (cached) {
    return cached;
  }

  class GeneratedStructure extends Structure {
    public static override readonly resourceName = resourceName;
  }

  structureCtorCache.set(resourceName, GeneratedStructure);
  return GeneratedStructure;
}
