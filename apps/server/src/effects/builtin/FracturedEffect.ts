import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import { requireEffectContent } from "@shared/content/catalog.ts";

/**
 * Applies a refreshable fractured limb effect that slows movement,
 * representing a broken bone that makes the target limp.
 */
export class FracturedEffect extends Effect {
  public static override readonly resourceName = "fractured";
  public readonly durationTicks: number;

  constructor(durationTicks?: number) {
    super();
    this.durationTicks =
      durationTicks ?? requireEffectContent(this.typeId).durationTicks ?? 0;
  }

  public override apply(_world: World, _source: Entity, target: Entity): void {
    if (this.durationTicks <= 0) {
      return;
    }

    target.applyOrRefreshActiveEffect({
      typeId: this.typeId,
      ticksRemaining: this.durationTicks,
      speedMultiplier: requireEffectContent(this.typeId).speedMultiplier,
    });
  }
}
