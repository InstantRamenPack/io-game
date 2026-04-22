import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";

/**
 * Heavy projectile fired by the cannon building.
 */
export class CannonBullet extends Projectile {
  public static override readonly resourceName = "cannon_bullet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:cannon_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
