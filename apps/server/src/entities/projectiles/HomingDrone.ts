import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { triggerExplosion } from "@server/combat/explosions.ts";
import type { Entity } from "@server/entities/Entity.ts";
import {
  Projectile,
  type ProjectileDefinition,
  type ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";
import { HomingTargetGoal } from "@server/goals/builtin/HomingTargetGoal.ts";
import type {World} from "@server/world/World.ts";

const SEEK_RADIUS = 260;
const TURN_BLEND = 0.18;

export class HomingDrone extends Projectile {
  public static override readonly resourceName = "homing_drone";
  public static readonly definition: ProjectileDefinition = {
    speed: 9,
    range: 5000,
    hitboxes: [makeHitboxRect(12, 12)],
    maxHits: 1,
    hitEffects: [],
  };

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
    this.registerGoals([new HomingTargetGoal<HomingDrone>(0, SEEK_RADIUS, TURN_BLEND)]);
  }

  protected override applyImpact(world: World, _target: Entity): void {
    triggerExplosion(world, this, {
      x: this.x,
      y: this.y,
      radius: 96,
      maxDamage: 35,
      maxKnockback: 18,
      style: "drone",
    });
  }
}
