import { canAttackTarget } from "@server/combat/combatRules.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import { RadialAreaEffect, type RadialAreaEffectHitContext } from "@server/effects/area/RadialAreaEffect.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import type { World } from "@server/world/World.ts";

const DAMAGE = 40;
const KNOCKBACK = 25;

/**
 * Non-explosion slam AoE used by the Megaknight landing attack.
 */
export class MegaknightSlamAreaEffect extends RadialAreaEffect {
  protected override readonly radius = 120;

  /**
   * The slam only affects player targets that pass combat rules.
   */
  protected override isTargetEligible(
    world: World,
    source: Entity,
    target: Entity,
  ): boolean {
    return (
      target.alive &&
      target instanceof Player &&
      canAttackTarget(world, source, target)
    );
  }

  /**
   * Applies the slam's knockback and damage package.
   */
  protected override applyToTarget(
    world: World,
    source: Entity,
    target: Entity,
    _hitContext: RadialAreaEffectHitContext,
  ): void {
    this.applyEffectsToTarget(world, source, target, [
      new KnockbackEffect(KNOCKBACK),
      new DamageEffect(DAMAGE),
    ]);
  }
}
