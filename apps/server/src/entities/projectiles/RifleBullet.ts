import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";

export class RifleBullet extends Projectile {
  public static override readonly resourceName = "rifle_bullet";
  public static readonly definition: ProjectileDefinition = {
    speed: 55,
    range: 900,
    hitboxes: [makeHitboxRect(8, 8)],
    maxHits: 1,
    hitEffects: [new DamageEffect(20)],
  };

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
