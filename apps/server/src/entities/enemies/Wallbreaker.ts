import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { triggerWallbreakerExplosion } from "@server/combat/wallbreakerExplosion.ts";
import { Building } from "@server/entities/Building.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import type { World } from "@server/world/World.ts";

const TRIGGER_RADIUS = 36;

export class Wallbreaker extends Enemy {
  public static override readonly resourceName = "wallbreaker";

  constructor(id: number) {
    super(id, {
      hitboxProfiles: {
        default: [makeHitboxRect(22, 22)],
      },
      maxHp: 1,
      vx: 0,
      vy: 0,
      moveSpeed: 9,
      weapons: [],
      goals: [
        new TargetEntityGoal<Enemy>(0, Wall, Infinity),
        new TargetEntityGoal<Enemy>(1, Building, Infinity),
        new TargetEntityGoal<Enemy>(2, Player, Infinity),
        new GoToTargetGoal<Enemy>(3, 20),
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

    triggerWallbreakerExplosion(world, this);
    this.alive = false;
    world.despawn(this.id);
  }
}
