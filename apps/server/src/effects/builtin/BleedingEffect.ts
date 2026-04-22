import { combatEligibilityService } from "@server/combat/CombatEligibilityService.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";

/**
 * Applies a refreshable damage-over-time bleed to a target.
 */
export class BleedingEffect extends Effect {
  public static override readonly resourceName = "bleeding";

  constructor(
    public readonly totalDurationTicks = 40,
    public readonly pulseIntervalTicks = 4,
    public readonly pulseDamage = 5,
  ) {
    super();
  }

  public override apply(world: World, source: Entity, target: Entity): void {
    const instigator = source.getCombatInstigator(world);
    if (
      !instigator ||
      !combatEligibilityService.canAttackTarget(world, source, target) ||
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
