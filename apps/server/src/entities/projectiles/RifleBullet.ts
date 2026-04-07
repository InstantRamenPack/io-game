import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { makeProjectileDefinition } from "@server/entities/projectiles/projectileContent.ts";

export class RifleBullet extends Projectile {
  public static override readonly resourceName = "rifle_bullet";
  public static readonly definition: ProjectileDefinition =
    makeProjectileDefinition("projectile:rifle_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
