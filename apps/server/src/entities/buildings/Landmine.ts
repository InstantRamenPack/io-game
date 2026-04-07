import { getEntityContent } from "@shared/content/catalog.ts";
import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { Building } from "@server/entities/Building.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { LandmineExplosionAreaEffect } from "@server/effects/area/LandmineExplosionAreaEffect.ts";
import { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";

const TRIGGER_RADIUS = 28;
export class Landmine extends Building {
  public static override readonly resourceName = "landmine";

  constructor(id: number, label: string, tier = 1, ownerId?: number) {
    const content = getEntityContent(
      makeResourceId("building", Landmine.resourceName),
    );
    super(id, label, tier, ownerId, {
      baseHp: 30,
      hitboxProfiles:
        content?.hitboxProfiles ??
        ({
          default: [makeHitboxRect(18, 18)],
        } as const),
      activeHitboxProfile: content?.activeHitboxProfile,
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

    for (const candidate of world.spatial.queryBox(
      this.x - TRIGGER_RADIUS,
      this.y - TRIGGER_RADIUS,
      this.x + TRIGGER_RADIUS,
      this.y + TRIGGER_RADIUS,
    )) {
      if (!(candidate instanceof Enemy) || !candidate.alive) {
        continue;
      }

      const distanceSquared = getDistanceSquaredToResolvedRectSet(
        candidate.getWorldHitboxes(),
        this.x,
        this.y,
      );
      if (distanceSquared > TRIGGER_RADIUS * TRIGGER_RADIUS) {
        continue;
      }

      new LandmineExplosionAreaEffect().apply(world, this, {
        x: this.x,
        y: this.y,
      });
      this.alive = false;
      world.despawn(this.id);
      return;
    }
  }
}
