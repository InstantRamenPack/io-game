import { canAttackTarget } from "@server/combat/combatRules.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { ExplosionAreaEffect } from "@server/effects/area/ExplosionAreaEffect.ts";
import type { RadialAreaEffectHitContext } from "@server/effects/area/RadialAreaEffect.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import type { World } from "@server/world/World.ts";

const MAX_DAMAGE = 35;
const MAX_KNOCKBACK = 18;

/**
 * Homing drone detonation with radial knockback and falloff damage.
 */
export class DroneExplosionAreaEffect extends ExplosionAreaEffect {
  protected override readonly radius = 96;
  protected override readonly style = "drone" as const;

  /**
   * Drones affect valid hostile combat targets within the blast radius.
   */
  protected override isTargetEligible(
    world: World,
    source: Entity,
    target: Entity,
  ): boolean {
    return target.alive && canAttackTarget(world, source, target);
  }

  /**
   * Applies radial knockback and falloff damage to each affected target.
   */
  protected override applyToTarget(
    world: World,
    source: Entity,
    target: Entity,
    hitContext: RadialAreaEffectHitContext,
  ): void {
    const falloff = 1 - hitContext.distanceRatio;
    if (falloff <= 0) {
      return;
    }

    this.applyEffectsToTarget(world, source, target, [
      new KnockbackEffect(MAX_KNOCKBACK * falloff),
      new DamageEffect(Math.max(1, Math.round(MAX_DAMAGE * falloff))),
    ]);
  }
}
