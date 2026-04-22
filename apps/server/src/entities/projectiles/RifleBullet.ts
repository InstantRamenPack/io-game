import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";

export class RifleBullet extends Projectile {
  public static override readonly resourceName = "rifle_bullet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:rifle_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
