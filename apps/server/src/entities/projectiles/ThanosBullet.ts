import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";
import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";

export class ThanosBullet extends Projectile {
  public static override readonly resourceName = "thanos_bullet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:thanos_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
