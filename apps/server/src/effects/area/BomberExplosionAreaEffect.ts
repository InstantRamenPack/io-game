import { canAttackTarget } from "@server/combat/combatRules.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import { ExplosionAreaEffect } from "@server/effects/area/ExplosionAreaEffect.ts";
import type { RadialAreaEffectHitContext } from "@server/effects/area/RadialAreaEffect.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { World } from "@server/world/World.ts";

const DAMAGE_PLAYER = 200;

/**
 * Bomber self-destruct that only damages players inside the blast radius.
 */
export class BomberExplosionAreaEffect extends ExplosionAreaEffect {
  protected override readonly radius = 100;
  protected override readonly style = "wallbreaker" as const;

  /**
   * Bombers only affect player targets that pass combat rules.
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
   * Applies the bomber's fixed player damage.
   */
  protected override applyToTarget(
    world: World,
    source: Entity,
    target: Entity,
    _hitContext: RadialAreaEffectHitContext,
  ): void {
    this.applyEffectsToTarget(world, source, target, [
      new DamageEffect(DAMAGE_PLAYER),
    ]);
  }
}
