import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";
import {
  Projectile,
  type ProjectileDefinition,
  type ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";

export class SmallFirecrackerBullet extends Projectile {
  public static override readonly resourceName = "small_firecracker_bullet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:small_firecracker_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
