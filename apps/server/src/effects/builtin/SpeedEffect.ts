import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import { requireEffectContent } from "@shared/content/catalog.ts";

/**
 * Applies a refreshable movement-speed modifier authored by effect content.
 */
export class SpeedEffect extends Effect {
  public static override readonly resourceName = "speed";

  constructor(public readonly durationTicks = 0) {
    super();
  }

  public override apply(_world: World, _source: Entity, target: Entity): void {
    if (this.durationTicks <= 0) {
      return;
    }

    const speedMultiplier = requireEffectContent(this.typeId).speedMultiplier;
    if (speedMultiplier === undefined) {
      return;
    }

    target.applyOrRefreshActiveEffect({
      typeId: this.typeId,
      ticksRemaining: this.durationTicks,
      speedMultiplier,
    });
  }
}
