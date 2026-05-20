// Scaffolded by scripts/generate-content-manifest.ts. Safe to edit; the generator will not overwrite this file.
import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";
import {
  Projectile,
  type ProjectileDefinition,
  type ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";

export class BattleRifleBullet extends Projectile {
  public static override readonly resourceName = "battle_rifle_bullet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:battle_rifle_bullet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
