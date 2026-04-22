import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";

export class SniperBullet extends Projectile {
  public static override readonly resourceName = "sniper_bullet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:sniper_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
