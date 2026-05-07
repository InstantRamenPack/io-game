import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";

export class ThanosRocket extends Projectile {
  public static override readonly resourceName = "thanos_rocket";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:thanos_rocket");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
