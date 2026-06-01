import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import { requireEffectContent } from "@shared/content/catalog.ts";

/**
 * Applies a refreshable short stun that blocks actions.
 */
export class StunnedEffect extends Effect {
  public static override readonly resourceName = "stunned";
  public readonly durationTicks: number;

  constructor(durationTicks?: number) {
    super();
    this.durationTicks =
      durationTicks ?? requireEffectContent(this.typeId).durationTicks ?? 0;
  }

  public override apply(world: World, source: Entity, target: Entity): void {
    const instigator = DamageEffect.resolveInstigator(world, source);
    if (
      !instigator ||
      !DamageEffect.canApply(world, source, target) ||
      this.durationTicks <= 0
    ) {
      return;
    }

    target.applyOrRefreshActiveEffect({
      typeId: this.typeId,
      ticksRemaining: this.durationTicks,
      sourceId: instigator.id,
      preventsAction: true,
    });
    target.steerTowardVelocity(0, 0, Number.POSITIVE_INFINITY);
  }
}
