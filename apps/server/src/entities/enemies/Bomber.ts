import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import { bomberExplosion } from "@server/effects/area/areaEffects.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { createCombatTargetGoals } from "@server/goals/builtin/combatTargetGoals.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import type { World } from "@server/world/World.ts";

const TRIGGER_RADIUS = 42;

export class Bomber extends Enemy {
  public static override readonly resourceName = "bomber";

  constructor(id: number) {
    super(id, {
      weapons: [],
      goals: [
        ...createCombatTargetGoals(0, 825),
        new LookAtTargetGoal<Enemy>(1),
        new GoToTargetGoal<Enemy>(2, 20),
      ],
    });
  }

  public override tick(world: World): void {
    super.tick(world);
    if (
      !this.alive ||
      !world.entities.has(this.id) ||
      !world.shouldRunEntityGoalsAndCollisions(this)
    ) {
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

    bomberExplosion.apply(world, this, {
      x: this.x,
      y: this.y,
    });
    this.alive = false;
    world.despawn(this.id);
  }
}
