import type { Entity } from "@server/entities/Entity.ts";
import { ExplosionAreaEffect } from "@server/effects/area/ExplosionAreaEffect.ts";
import type { RadialAreaEffectHitContext } from "@server/effects/area/RadialAreaEffect.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import type { World } from "@server/world/World.ts";

const MAX_DAMAGE = 80;
const MAX_KNOCKBACK = 32;

/**
 * Player-owned landmine blast with falloff damage, knockback, and stun.
 */
export class LandmineExplosionAreaEffect extends ExplosionAreaEffect {
  protected override readonly radius = 140;
  protected override readonly style = "landmine" as const;

  /**
   * Landmines affect valid hostile combat targets within the blast radius.
   */
  protected override isTargetEligible(
    world: World,
    source: Entity,
    target: Entity,
  ): boolean {
    return target.alive && DamageEffect.canApply(world, source, target);
  }

  /**
   * Applies radial knockback, falloff damage, and a stun to each affected target.
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
      new StunnedEffect(),
    ]);
  }
}
