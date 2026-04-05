import type { Entity } from "@server/entities/Entity.ts";
import {
  Projectile,
  type ProjectileDefinition,
  type ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";
import { DroneExplosionAreaEffect } from "@server/effects/area/DroneExplosionAreaEffect.ts";
import { HomingTargetGoal } from "@server/goals/builtin/HomingTargetGoal.ts";
import type { World } from "@server/world/World.ts";
import { makeProjectileDefinition } from "@server/entities/projectiles/projectileContent.ts";

const SEEK_RADIUS = 260;
const TURN_BLEND = 0.18;

export class HomingDrone extends Projectile {
  public static override readonly resourceName = "homing_drone";
  public static readonly definition: ProjectileDefinition =
    makeProjectileDefinition("projectile:homing_drone");

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
    this.registerGoals([
      new HomingTargetGoal<HomingDrone>(0, SEEK_RADIUS, TURN_BLEND),
    ]);
  }

  protected override applyImpact(world: World, _target: Entity): void {
    new DroneExplosionAreaEffect().apply(world, this, {
      x: this.x,
      y: this.y,
    });
  }
}
