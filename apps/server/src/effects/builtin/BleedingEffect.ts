import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import { requireEffectContent } from "@shared/content/catalog.ts";

/**
 * Applies a refreshable damage-over-time bleed to a target.
 */
export class BleedingEffect extends Effect {
  public static override readonly resourceName = "bleeding";

  constructor(
    totalDurationTicks?: number,
    pulseIntervalTicks?: number,
    pulseDamage?: number,
  ) {
    super();
    const content = requireEffectContent(this.typeId);
    this.totalDurationTicks = totalDurationTicks ?? content.durationTicks ?? 0;
    this.pulseIntervalTicks =
      pulseIntervalTicks ?? content.pulseIntervalTicks ?? 0;
    this.pulseDamage = pulseDamage ?? content.pulseDamage ?? 0;
  }

  public readonly totalDurationTicks: number;
  public readonly pulseIntervalTicks: number;
  public readonly pulseDamage: number;

  public override apply(world: World, source: Entity, target: Entity): void {
    const instigator = DamageEffect.resolveInstigator(world, source);
    if (
      !instigator ||
      !DamageEffect.canApply(world, source, target) ||
      this.totalDurationTicks <= 0 ||
      this.pulseIntervalTicks <= 0 ||
      this.pulseDamage <= 0
    ) {
      return;
    }

    target.applyOrRefreshActiveEffect({
      typeId: this.typeId,
      ticksRemaining: this.totalDurationTicks,
      sourceId: instigator.id,
      pulseIntervalTicks: this.pulseIntervalTicks,
      pulseTicksRemaining: this.pulseIntervalTicks,
      pulseDamage: this.pulseDamage,
    });
  }
}
