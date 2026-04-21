import type { Entity } from "@server/entities/Entity.ts";
import { Building } from "@server/entities/Building.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { LookAtTargetGoal } from "@server/goals/builtin/LookAtTargetGoal.ts";
import { RangedAttackGoal } from "@server/goals/builtin/RangedAttackGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { CannonGun } from "@server/items/weapons/CannonGun.ts";
import type { World } from "@server/world/World.ts";
import { getEntityContent } from "@shared/content/catalog.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";

export class Cannon extends Building {
  public static override readonly resourceName = "cannon";

  constructor(id: number, label: string, tier = 1, ownerId?: number) {
    const content = getEntityContent(
      makeResourceId("building", Cannon.resourceName),
    );
    super(id, label, tier, ownerId, {
      baseHp: 240,
      hitboxProfiles:
        content?.hitboxProfiles ??
        ({
          default: [makeHitboxRect(36, 40)],
        } as const),
      activeHitboxProfile: content?.activeHitboxProfile,
    });
    this.weapons = [new CannonGun()];
    this.registerGoals([
      new TargetEntityGoal<Cannon>(0, Enemy, 650),
      new LookAtTargetGoal<Cannon>(1),
      new RangedAttackGoal<Cannon>(2, 0, 0, 0, 45, 1),
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
