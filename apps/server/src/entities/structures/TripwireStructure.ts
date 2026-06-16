import { DestructibleStructure } from "@server/entities/structures/DestructibleStructure.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { World } from "@server/world/World.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { resolveHitboxRects } from "@shared/geometry/hitbox.ts";
import { getEntityContent } from "@shared/content/catalog.ts";
import type { TrapEffectContent } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export class TripwireStructure extends DestructibleStructure {
  public static override readonly resourceName = "tripwire";
  private triggered = false;
  private readonly triggerQueryBuffer: Entity[] = [];

  public override tick(world: World): void {
    super.tick(world);
    if (this.triggered || !this.alive || !world.entities.has(this.id)) {
      return;
    }

    const trap = getEntityContent(TripwireStructure.typeId)?.trap;
    if (!trap) {
      return;
    }

    const bounds = this.getWorldBounds();
    const trapRects = resolveHitboxRects(this.x, this.y, this.hitboxes);
    for (const candidate of world.spatial.queryBox(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
      this.triggerQueryBuffer,
    )) {
      if (candidate.getCombatTeam() !== "player" || !candidate.alive) {
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
      if (typeof trap.initialDamage === "number" && trap.initialDamage > 0) {
        new DamageEffect(trap.initialDamage).apply(world, this, candidate);
      }
      for (const effect of trap.effects ?? []) {
        candidate.applyOrRefreshActiveEffect(toActiveEffect(effect, this.id));
      }
      this.alive = false;
      world.despawn(this.id);
      return;
    }
  }
}

function toActiveEffect(
  effect: TrapEffectContent,
  sourceId: number,
): {
  typeId: ResourceId;
  ticksRemaining: number;
  sourceId?: number;
  pulseIntervalTicks?: number;
  pulseTicksRemaining?: number;
  pulseDamage?: number;
  speedMultiplier?: number;
} {
  return {
    typeId: effect.typeId,
    ticksRemaining: effect.ticksRemaining,
    sourceId,
    pulseIntervalTicks: effect.pulseIntervalTicks,
    pulseTicksRemaining: effect.pulseTicksRemaining,
    pulseDamage: effect.pulseDamage,
    speedMultiplier: effect.speedMultiplier,
  };
}
