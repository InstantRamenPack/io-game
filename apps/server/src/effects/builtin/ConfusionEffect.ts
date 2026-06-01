import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import { requireEffectContent } from "@shared/content/catalog.ts";

/**
 * Applies a refreshable confusion effect that slows movement and
 * triggers disorienting visuals on the client.
 */
export class ConfusionEffect extends Effect {
  public static override readonly resourceName = "confusion";
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
