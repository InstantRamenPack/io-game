import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";
import {
  Projectile,
  type ProjectileDefinition,
  type ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { RegistrableProjectileCtor } from "@server/registry/registries.ts";

const contentProjectileCtorCache = new Map<string, RegistrableProjectileCtor>();

/**
 * Shared runtime base for projectiles whose tuning comes from JSON content.
 */
export class ContentProjectile extends Projectile {
  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}

export function createContentProjectileCtor(
  resourceName: string,
  typeId: ResourceId,
): RegistrableProjectileCtor {
  const cached = contentProjectileCtorCache.get(typeId);
  if (cached) {
    return cached;
  }

  class GeneratedContentProjectile extends ContentProjectile {
    public static override readonly resourceName = resourceName;
    public static readonly definition: ProjectileDefinition =
      createProjectileDefinitionForType(typeId);
  }

  contentProjectileCtorCache.set(typeId, GeneratedContentProjectile);
  return GeneratedContentProjectile;
}
