import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import {
  Projectile,
  type ProjectileSpawnConfig,
  type ProjectileDefinition,
} from "@server/entities/Projectile.ts";

/**
 * Pierce-capable projectile fired by the crossbow.
 */
export class CrossbowArrow extends Projectile {
  public static override readonly resourceName = "crossbow_arrow";
  public static readonly definition: ProjectileDefinition = {
    speed: 36,
    range: 720,
    hitboxes: [makeHitboxRect(8, 8)],
    maxHits: 5,
    hitEffects: [new DamageEffect(16)],
  };

  public constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }
}
