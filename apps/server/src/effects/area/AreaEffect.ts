import type { Entity } from "@server/entities/Entity.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";

/**
 * World-space origin used by multi-target effects.
 */
export type AreaEffectOrigin = {
  x: number;
  y: number;
};

/**
 * Base class for multi-target gameplay effects.
 * This is intentionally separate from the target-local Effect hierarchy.
 */
export abstract class AreaEffect {
  /**
   * Applies target-local effects to a resolved affected entity.
   */
  protected applyEffectsToTarget(
    world: World,
    source: Entity,
    target: Entity,
    effects: readonly Effect[],
  ): void {
    for (const effect of effects) {
      effect.apply(world, source, target);
    }
  }

  public abstract apply(
    world: World,
    source: Entity,
    origin: AreaEffectOrigin,
  ): void;
}
