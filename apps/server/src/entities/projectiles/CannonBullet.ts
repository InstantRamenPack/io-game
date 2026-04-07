import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { makeProjectileDefinition } from "@server/entities/projectiles/projectileContent.ts";

/**
 * Heavy projectile fired by the cannon building.
 */
export class CannonBullet extends Projectile {
  public static override readonly resourceName = "cannon_bullet";
  public static readonly definition: ProjectileDefinition =
    makeProjectileDefinition("projectile:cannon_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
