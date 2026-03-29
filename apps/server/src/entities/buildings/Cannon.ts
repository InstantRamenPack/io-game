import type { Entity } from "@server/entities/Entity.ts";
import { Building } from "@server/entities/Building.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { CannonGun } from "@server/items/weapons/CannonGun.ts";
import type { World } from "@server/world/World.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";

export class Cannon extends Building {
  public static override readonly resourceName = "cannon";

  public constructor(id: number, label: string, tier = 1, ownerId?: number) {
    super(id, label, tier, ownerId, {
      baseHp: 240,
      hitboxProfiles: {
        default: [makeHitboxRect(36, 40)],
      },
    });
    this.weapons = [new CannonGun()];
    this.registerGoals([
      new TargetEntityGoal<Cannon>(0, Enemy, 650),
      new RangedAttackGoal<Cannon>(1, 0, 0, 0),
    ]);
  }

  public override getCombatInstigator(world: World): Entity | null {
    if (this.ownerId === undefined) {
      return null;
    }

    const owner = world.get(this.ownerId);
    return owner instanceof Player && owner.alive ? owner : null;
  }
}
