import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";
import {
  Projectile,
  type ProjectileDefinition,
  type ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";

export class ShotgunPellet extends Projectile {
  public static override readonly resourceName = "shotgun_pellet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:shotgun_pellet");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
