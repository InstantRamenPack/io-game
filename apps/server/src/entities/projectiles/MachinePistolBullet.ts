// Scaffolded by scripts/generate-content-manifest.ts. Safe to edit; the generator will not overwrite this file.
import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";
import {
  Projectile,
  type ProjectileDefinition,
  type ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";

export class MachinePistolBullet extends Projectile {
  public static override readonly resourceName = "machine_pistol_bullet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:machine_pistol_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
