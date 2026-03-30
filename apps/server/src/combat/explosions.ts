import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import type { ExplosionStyle, NetEvent } from "@shared/net/events.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { Effect } from "@server/effects/Effect.ts";
import { canAttackTarget } from "@server/combat/combatRules.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";

export type ExplosionSpec = {
  x: number;
  y: number;
  radius: number;
  maxDamage: number;
  maxKnockback: number;
  style: ExplosionStyle;
  extraEffects?: readonly Effect[];
};

/**
 * Applies a radial explosion with linear damage and knockback falloff.
 */
export function triggerExplosion(
  world: World,
  source: Entity,
  spec: ExplosionSpec,
): void {
  if (
    spec.radius <= 0 ||
    spec.maxDamage <= 0 ||
    spec.maxKnockback < 0 ||
    !Number.isFinite(spec.radius) ||
    !Number.isFinite(spec.maxDamage) ||
    !Number.isFinite(spec.maxKnockback)
  ) {
    return;
  }

  const instigator = source.getCombatInstigator(world);
  const explosionEvent: NetEvent = {
    type: "explosion",
    tick: world.tick + 1,
    payload: {
      sourceId: instigator?.id ?? source.id,
      x: spec.x,
      y: spec.y,
      radius: spec.radius,
      style: spec.style,
    },
  };
  world.events.push(explosionEvent);

  const candidates = world.spatial.queryBox(
    spec.x - spec.radius,
    spec.y - spec.radius,
    spec.x + spec.radius,
    spec.y + spec.radius,
  );
  for (const candidate of candidates) {
    if (!candidate.alive || !canAttackTarget(world, source, candidate)) {
      continue;
    }

    const distance = Math.sqrt(
      getDistanceSquaredToResolvedRectSet(
        candidate.getWorldHitboxes(),
        spec.x,
        spec.y,
      ),
    );
    const scale = 1 - distance / spec.radius;
    if (scale <= 0) {
      continue;
    }

    new DamageEffect(Math.max(1, Math.round(spec.maxDamage * scale))).apply(
      world,
      source,
      candidate,
    );
    if (!candidate.alive) {
      continue;
    }

    applyExplosionKnockback(candidate, spec.x, spec.y, spec.maxKnockback * scale);
    for (const effect of spec.extraEffects ?? []) {
      effect.apply(world, source, candidate);
    }
  }
}

function applyExplosionKnockback(
  target: Entity,
  originX: number,
  originY: number,
  strength: number,
): void {
  if (strength <= 0) {
    return;
  }

  const deltaX = target.x - originX;
  const deltaY = target.y - originY;
  const distance = Math.hypot(deltaX, deltaY) || 1;
  target.applyImpulse((deltaX / distance) * strength, (deltaY / distance) * strength);
}
