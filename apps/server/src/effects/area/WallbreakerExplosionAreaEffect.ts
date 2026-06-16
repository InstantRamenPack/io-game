import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import { Wall } from "@server/registry/generated/buildingCtors.ts";
import { ExplosionAreaEffect } from "@server/effects/area/ExplosionAreaEffect.ts";
import type { RadialAreaEffectHitContext } from "@server/effects/area/RadialAreaEffect.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { World } from "@server/world/World.ts";

const DAMAGE_WALL = 200;
const DAMAGE_BUILDING = 80;
const DAMAGE_PLAYER = 200;

/**
 * Wallbreaker self-destruct that heavily punishes walls and players.
 */
export class WallbreakerExplosionAreaEffect extends ExplosionAreaEffect {
  protected override readonly radius = 90;
  protected override readonly style = "wallbreaker" as const;

  /**
   * Wallbreakers affect valid hostile combat targets within the blast radius.
   */
  protected override isTargetEligible(
    world: World,
    source: Entity,
    target: Entity,
  ): boolean {
    return target.alive && DamageEffect.canApply(world, source, target);
  }

  /**
   * Applies target-type-specific damage without falloff.
   */
  protected override applyToTarget(
    world: World,
    source: Entity,
    target: Entity,
    _hitContext: RadialAreaEffectHitContext,
  ): void {
    const damage =
      target instanceof Wall
        ? DAMAGE_WALL
        : target instanceof Player
          ? DAMAGE_PLAYER
          : DAMAGE_BUILDING;
    this.applyEffectsToTarget(world, source, target, [
      new DamageEffect(damage),
    ]);
  }
}
