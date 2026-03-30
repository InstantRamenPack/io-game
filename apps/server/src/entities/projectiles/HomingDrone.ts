import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { canAttackTarget } from "@server/combat/combatRules.ts";
import { triggerExplosion } from "@server/combat/explosions.ts";
import type { Entity } from "@server/entities/Entity.ts";
import {
  Projectile,
  type ProjectileDefinition,
  type ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";
import type { World } from "@server/world/World.ts";

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
  }

  public override tick(world: World): void {
    const target = this.findNearestTarget(world);
    if (target) {
      const deltaX = target.x - this.x;
      const deltaY = target.y - this.y;
      const distance = Math.hypot(deltaX, deltaY) || 1;
      const desiredX = deltaX / distance;
      const desiredY = deltaY / distance;
      this.setHeading(
        this.directionX * (1 - TURN_BLEND) + desiredX * TURN_BLEND,
        this.directionY * (1 - TURN_BLEND) + desiredY * TURN_BLEND,
      );
    }

    super.tick(world);
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

  private findNearestTarget(world: World): Entity | null {
    let bestTarget: Entity | null = null;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const candidate of world.spatial.queryBox(
      this.x - SEEK_RADIUS,
      this.y - SEEK_RADIUS,
      this.x + SEEK_RADIUS,
      this.y + SEEK_RADIUS,
    )) {
      if (!candidate.alive || !canAttackTarget(world, this, candidate)) {
        continue;
      }

      const distanceSquared =
        (candidate.x - this.x) * (candidate.x - this.x) +
        (candidate.y - this.y) * (candidate.y - this.y);
      if (distanceSquared >= bestDistanceSquared) {
        continue;
      }

      bestTarget = candidate;
      bestDistanceSquared = distanceSquared;
    }

    return bestTarget;
  }
}
