import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";

/**
 * Default single-hit bullet fired by the starter gun.
 */
export class BasicBullet extends Projectile {
  public static override readonly resourceName = "basic_bullet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:basic_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
