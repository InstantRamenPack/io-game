import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";

export class ShootaBullet extends Projectile {
  public static override readonly resourceName = "shoota_bullet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:shoota_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
