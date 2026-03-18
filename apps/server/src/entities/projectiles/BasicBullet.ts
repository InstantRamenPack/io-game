import type { Entity } from "@server/entities/Entity.ts";
import type { Effect } from "@server/effects/Effect.ts";
import {
  Projectile,
  type ProjectileSpawnConfig,
} from "@server/entities/projectiles/Projectile.ts";
import type { World } from "@server/world/World.ts";

/**
 * Default single-hit bullet fired by the starter gun.
 */
export class BasicBullet extends Projectile {
  static readonly typeId = "projectile:basic_bullet" as const;

  readonly damage: number;
  readonly hitEffects: Effect[];

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, BasicBullet.typeId, config);
    this.damage = config.damage ?? 0;
    this.hitEffects = [...(config.hitEffects ?? [])];
    this.radius = config.radius ?? 4;
  }

  protected override applyImpact(world: World, target: Entity): void {
    for (const effect of this.hitEffects) {
      effect.apply(world, this, target);
    }
  }
}
