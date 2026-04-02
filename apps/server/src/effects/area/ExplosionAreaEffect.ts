import type { NetEvent, ExplosionStyle } from "@shared/net/events.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { AreaEffectOrigin } from "@server/effects/area/AreaEffect.ts";
import { RadialAreaEffect } from "@server/effects/area/RadialAreaEffect.ts";
import type { World } from "@server/world/World.ts";

/**
 * Radial AoE base that also emits the existing client explosion event.
 */
export abstract class ExplosionAreaEffect extends RadialAreaEffect {
  protected abstract readonly style: ExplosionStyle;

  /**
   * Emits the shared explosion event used by the client renderer.
   */
  protected override beforeApply(
    world: World,
    source: Entity,
    origin: AreaEffectOrigin,
  ): void {
    const instigator = source.getCombatInstigator(world);
    const explosionEvent: NetEvent = {
      type: "explosion",
      tick: world.tick + 1,
      payload: {
        sourceId: instigator?.id ?? source.id,
        x: origin.x,
        y: origin.y,
        radius: this.radius,
        style: this.style,
      },
    };
    world.events.push(explosionEvent);
  }
}
