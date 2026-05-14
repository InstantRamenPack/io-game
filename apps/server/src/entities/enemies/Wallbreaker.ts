import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import { Building } from "@server/entities/Building.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { WallbreakerExplosionAreaEffect } from "@server/effects/area/WallbreakerExplosionAreaEffect.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import type { World } from "@server/world/World.ts";

const TRIGGER_RADIUS = 36;

export class Wallbreaker extends Enemy {
  public static override readonly resourceName = "wallbreaker";

  constructor(id: number) {
    super(id, {
      weapons: [],
      goals: [
        new TargetEntityGoal<Enemy>(0, Wall, 1050),
        new TargetEntityGoal<Enemy>(1, Building, 1050),
        new TargetEntityGoal<Enemy>(2, Player, 600, {
          requireLineOfSight: true,
        }),
        new LookAtTargetGoal<Enemy>(3),
        new GoToTargetGoal<Enemy>(4, 20),
      ],
    });
  }

  public override tick(world: World): void {
    super.tick(world);
    if (!this.alive || !world.entities.has(this.id)) {
      return;
    }

    const { targetId } = this;
    if (targetId === undefined) {
      return;
    }

    const target = world.get(targetId);
    if (!target?.alive) {
      return;
    }

    const distanceSquared = getDistanceSquaredToResolvedRectSet(
      target.getWorldHitboxes(),
      this.x,
      this.y,
    );
    if (distanceSquared > TRIGGER_RADIUS * TRIGGER_RADIUS) {
      return;
    }

    new WallbreakerExplosionAreaEffect().apply(world, this, {
      x: this.x,
      y: this.y,
    });
    this.alive = false;
    world.despawn(this.id);
  }
}
