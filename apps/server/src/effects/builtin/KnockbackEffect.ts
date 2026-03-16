import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";

/**
 * Pushes a target away from the source entity with a fixed impulse.
 */
export class KnockbackEffect extends Effect {
  readonly impulseStrength: number;

  constructor(impulseStrength = 140) {
    super("knockback", "Knockback");
    this.impulseStrength = impulseStrength;
  }

  override apply(_world: World, source: Entity, target: Entity): void {
    const deltaX = target.x - source.x;
    const deltaY = target.y - source.y;
    const distance = Math.hypot(deltaX, deltaY) || 1;

    target.applyImpulse(
      (deltaX / distance) * this.impulseStrength,
      (deltaY / distance) * this.impulseStrength,
    );
  }
}
