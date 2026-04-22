import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";

/**
 * Applies a refreshable fractured limb effect that slows movement,
 * representing a broken bone that makes the target limp.
 */
export class FracturedEffect extends Effect {
  public static override readonly resourceName = "fractured";

  constructor(public readonly durationTicks = 180) {
    super();
  }

  public override apply(_world: World, _source: Entity, target: Entity): void {
    if (this.durationTicks <= 0) {
      return;
    }

    target.applyOrRefreshActiveEffect({
      typeId: this.typeId,
      ticksRemaining: this.durationTicks,
      speedMultiplier: 0.5,
    });
  }
}
