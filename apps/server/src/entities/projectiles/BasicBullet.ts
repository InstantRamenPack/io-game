import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";

/**
 * Default single-hit bullet fired by the starter gun.
 */
export class BasicBullet extends Projectile {
  public static override readonly resourceName = "basic_bullet";
  public static readonly definition: ProjectileDefinition = {
    speed: 40,
    range: 700,
    hitboxes: [makeHitboxRect(8, 8)],
    maxHits: 1,
    hitEffects: [new DamageEffect(12)],
  };

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
