import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { makeProjectileDefinition } from "@server/entities/projectiles/projectileContent.ts";

/**
 * Pierce-capable projectile fired by the crossbow.
 */
export class CrossbowArrow extends Projectile {
  public static override readonly resourceName = "crossbow_arrow";
  public static readonly definition: ProjectileDefinition =
    makeProjectileDefinition("projectile:crossbow_arrow");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
