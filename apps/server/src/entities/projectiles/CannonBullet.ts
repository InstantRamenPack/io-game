import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";

/**
 * Heavy projectile fired by the cannon building.
 */
export class CannonBullet extends Projectile {
  public static override readonly resourceName = "cannon_bullet";
  public static readonly definition: ProjectileDefinition = {
    speed: 24,
    range: 650,
    hitboxes: [makeHitboxRect(12, 12)],
    maxHits: 1,
    hitEffects: [new DamageEffect(30)],
  };

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
