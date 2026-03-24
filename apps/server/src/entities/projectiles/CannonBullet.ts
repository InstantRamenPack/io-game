import type { Entity } from "@server/entities/Entity.ts";
import type { Effect } from "@server/effects/Effect.ts";
import {
  Projectile,
  type ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";
import type { World } from "@server/world/World.ts";

/**
 * Heavy projectile fired by the cannon building.
 */
export class CannonBullet extends Projectile {
  public static override readonly resourceName = "cannon_bullet";

  public readonly hitEffects: Effect[];

  public constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
    this.hitEffects = [...(config.hitEffects ?? [])];
    this.radius = config.radius ?? 6;
  }

  protected override applyImpact(world: World, target: Entity): void {
    for (const effect of this.hitEffects) {
      effect.apply(world, this, target);
    }
  }
}
