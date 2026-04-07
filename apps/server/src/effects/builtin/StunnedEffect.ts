import { canAttackTarget } from "@server/combat/combatRules.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";

/**
 * Applies a refreshable short stun that blocks actions.
 */
export class StunnedEffect extends Effect {
  public static override readonly resourceName = "stunned";

  constructor(public readonly durationTicks = 10) {
    super();
  }

  public override apply(world: World, source: Entity, target: Entity): void {
    const instigator = source.getCombatInstigator(world);
    if (
      !instigator ||
      !canAttackTarget(world, source, target) ||
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
