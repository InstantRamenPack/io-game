import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { makeProjectileDefinition } from "@server/entities/projectiles/projectileContent.ts";

/**
 * Default single-hit bullet fired by the starter gun.
 */
export class BasicBullet extends Projectile {
  public static override readonly resourceName = "basic_bullet";
  public static readonly definition: ProjectileDefinition =
    makeProjectileDefinition("projectile:basic_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
