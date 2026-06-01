import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { resolveHitboxRects } from "@shared/geometry/hitbox.ts";

export class Tripwire extends Enemy {
  public static override readonly resourceName = "tripwire";
  private triggered = false;

  constructor(id: number) {
    super(id, {});
  }

  public override tick(world: World): void {
    super.tick(world);
    if (this.triggered || !this.alive || !world.entities.has(this.id)) {
      return;
    }

    const bounds = this.getWorldBounds();
    const trapRects = resolveHitboxRects(this.x, this.y, this.hitboxes);
    for (const candidate of world.spatial.queryBox(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    )) {
      if (!(candidate instanceof Player) || !candidate.alive) {
        continue;
      }
      if (
        !doResolvedRectSetsOverlap(
          trapRects,
          resolveHitboxRects(candidate.x, candidate.y, candidate.hitboxes),
        )
      ) {
        continue;
      }
      this.triggered = true;
      candidate.applyDamage(world, 12, this.id);
      candidate.applyOrRefreshActiveEffect({
        typeId: "effect:bleeding" as const,
        ticksRemaining: 90,
        sourceId: this.id,
        pulseIntervalTicks: 10,
        pulseTicksRemaining: 10,
        pulseDamage: 4,
      });
      candidate.applyOrRefreshActiveEffect({
        typeId: "effect:fractured" as const,
        ticksRemaining: 140,
        speedMultiplier: 0.55,
      });
      candidate.applyOrRefreshActiveEffect({
        typeId: "effect:confusion" as const,
        ticksRemaining: 100,
        speedMultiplier: 0.75,
      });
      this.alive = false;
      world.despawn(this.id);
      return;
    }
  }
}
