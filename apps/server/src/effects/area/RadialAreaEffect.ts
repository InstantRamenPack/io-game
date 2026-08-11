import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import type { ExplosionStyle, NetEvent } from "@shared/net/events.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import type { World } from "@server/world/World.ts";

export type AreaEffectOrigin = { x: number; y: number };
export type RadialAreaEffectConfig = {
  radius: number;
  damage: number | ((target: Entity) => number);
  knockback?: number;
  falloff?: boolean;
  stun?: boolean;
  style?: ExplosionStyle;
};

/** Applies one content-like radial damage record without per-weapon subclasses. */
export class RadialAreaEffect {
  private readonly candidates: Entity[] = [];

  constructor(private readonly config: RadialAreaEffectConfig) {}

  public apply(world: World, source: Entity, origin: AreaEffectOrigin): void {
    const { radius, style } = this.config;
    if (
      !Number.isFinite(origin.x) ||
      !Number.isFinite(origin.y) ||
      radius <= 0
    ) {
      return;
    }
    if (style) {
      const instigator = source.getCombatInstigator(world);
      world.events.push({
        type: "explosion",
        payload: {
          sourceId: instigator?.id ?? source.id,
          x: origin.x,
          y: origin.y,
          radius,
          style,
        },
      } satisfies NetEvent);
    }

    for (const target of world.spatial.queryBox(
      origin.x - radius,
      origin.y - radius,
      origin.x + radius,
      origin.y + radius,
      this.candidates,
    )) {
      if (!target.alive || !DamageEffect.canApply(world, source, target)) {
        continue;
      }
      const distance = Math.sqrt(
        getDistanceSquaredToResolvedRectSet(
          target.getWorldHitboxes(),
          origin.x,
          origin.y,
        ),
      );
      if (distance > radius) continue;

      const scale = this.config.falloff ? 1 - distance / radius : 1;
      if (scale <= 0) continue;
      if (this.config.knockback) {
        new KnockbackEffect(this.config.knockback * scale).apply(
          world,
          source,
          target,
        );
      }
      const baseDamage =
        typeof this.config.damage === "function"
          ? this.config.damage(target)
          : this.config.damage;
      new DamageEffect(
        this.config.falloff
          ? Math.max(1, Math.round(baseDamage * scale))
          : baseDamage,
      ).apply(world, source, target);
      if (this.config.stun) {
        new StunnedEffect().apply(world, source, target);
      }
    }
  }
}
