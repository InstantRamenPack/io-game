import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";

/**
 * Pierce-capable projectile fired by the crossbow.
 */
export class CrossbowArrow extends Projectile {
  public static override readonly resourceName = "crossbow_arrow";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:crossbow_arrow");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
