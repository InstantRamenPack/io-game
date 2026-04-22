import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import { BomberExplosionAreaEffect } from "@server/effects/area/BomberExplosionAreaEffect.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import type { World } from "@server/world/World.ts";

const TRIGGER_RADIUS = 42;

export class Bomber extends Enemy {
  public static override readonly resourceName = "bomber";

  constructor(id: number) {
    super(id, {
      weapons: [],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, Infinity),
        new LookAtTargetGoal<Enemy>(1),
        new GoToTargetGoal<Enemy>(2, 20),
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

    new BomberExplosionAreaEffect().apply(world, this, {
      x: this.x,
      y: this.y,
    });
    this.alive = false;
    world.despawn(this.id);
  }
}
