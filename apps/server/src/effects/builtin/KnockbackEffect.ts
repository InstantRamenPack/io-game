import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import { requireEffectContent } from "@shared/content/catalog.ts";

/**
 * Pushes a target away from the source entity with a fixed impulse.
 */
export class KnockbackEffect extends Effect {
  public static override readonly resourceName = "knockback";
  public readonly impulseStrength: number;

  constructor(impulseStrength?: number) {
    super();
    this.impulseStrength =
      impulseStrength ?? requireEffectContent(this.typeId).impulseStrength ?? 0;
  }

  public override apply(_world: World, source: Entity, target: Entity): void {
    const deltaX = target.x - source.x;
    const deltaY = target.y - source.y;
    const distance = Math.hypot(deltaX, deltaY) || 1;

    target.applyImpulse(
      (deltaX / distance) * this.impulseStrength,
      (deltaY / distance) * this.impulseStrength,
    );
  }
}
