import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import { getEntityContent } from "@shared/content/catalog.ts";
import { Building } from "@server/entities/Building.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { landmineExplosion } from "@server/effects/area/areaEffects.ts";
import { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

const DEFAULT_TRIGGER_RADIUS = 28;

export class Landmine extends Building {
  public static override readonly resourceName = "landmine";
  private readonly triggerRadius: number;
  private readonly triggerQueryBuffer: Entity[] = [];

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
    this.triggerRadius =
      getEntityContent(Landmine.typeId)?.trap?.triggerRadius ??
      DEFAULT_TRIGGER_RADIUS;
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
      this.x - this.triggerRadius,
      this.y - this.triggerRadius,
      this.x + this.triggerRadius,
      this.y + this.triggerRadius,
      this.triggerQueryBuffer,
    )) {
      if (candidate.getCombatTeam() !== "enemy" || !candidate.alive) {
        continue;
      }

      const distanceSquared = getDistanceSquaredToResolvedRectSet(
        candidate.getWorldHitboxes(),
        this.x,
        this.y,
      );
      if (distanceSquared > this.triggerRadius * this.triggerRadius) {
        continue;
      }

      landmineExplosion.apply(world, this, {
        x: this.x,
        y: this.y,
      });
      this.alive = false;
      world.despawn(this.id);
      return;
    }
  }
}
