import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { triggerExplosion } from "@server/combat/explosions.ts";
import { Building } from "@server/entities/Building.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import type { World } from "@server/world/World.ts";

const TRIGGER_RADIUS = 28;
const EXPLOSION_RADIUS = 140;
const EXPLOSION_DAMAGE = 80;
const EXPLOSION_KNOCKBACK = 32;

export class Landmine extends Building {
  public static override readonly resourceName = "landmine";

  constructor(id: number, label: string, tier = 1, ownerId?: number) {
    super(id, label, tier, ownerId, {
      baseHp: 30,
      hitboxProfiles: {
        default: [makeHitboxRect(18, 18)],
      },
    });
    this.collisionMode = "none";
  }

  public override getCombatInstigator(world: World): Entity | null {
    if (this.ownerId === undefined) {
      return null;
    }

    const owner = world.get(this.ownerId);
    return owner instanceof Player && owner.alive ? owner : null;
  }

  public override tick(world: World): void {
    super.tick(world);
    if (!this.alive || !world.entities.has(this.id)) {
      return;
    }

    for (const enemy of world.entities.queryInstances(Enemy)) {
      if (!enemy.alive) {
        continue;
      }

      const distanceSquared = getDistanceSquaredToResolvedRectSet(
        enemy.getWorldHitboxes(),
        this.x,
        this.y,
      );
      if (distanceSquared > TRIGGER_RADIUS * TRIGGER_RADIUS) {
        continue;
      }

      triggerExplosion(world, this, {
        x: this.x,
        y: this.y,
        radius: EXPLOSION_RADIUS,
        maxDamage: EXPLOSION_DAMAGE,
        maxKnockback: EXPLOSION_KNOCKBACK,
        style: "landmine",
        extraEffects: [new StunnedEffect()],
      });
      this.alive = false;
      world.despawn(this.id);
      return;
    }
  }
}
