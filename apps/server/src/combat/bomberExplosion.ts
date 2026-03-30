import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import type { NetEvent } from "@shared/net/events.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { canAttackTarget } from "@server/combat/combatRules.ts";
import { Player } from "@server/entities/Player.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";

export const BOMBER_EXPLOSION_RADIUS = 100;

const DAMAGE_PLAYER = 200;

/**
 * Explosion that one-shots players in a large radius.
 */
export function triggerBomberExplosion(world: World, source: Entity): void {
  const explosionEvent: NetEvent = {
    type: "explosion",
    tick: world.tick + 1,
    payload: {
      sourceId: source.id,
      x: source.x,
      y: source.y,
      radius: BOMBER_EXPLOSION_RADIUS,
      style: "wallbreaker",
    },
  };
  world.events.push(explosionEvent);

  const candidates = world.spatial.queryBox(
    source.x - BOMBER_EXPLOSION_RADIUS,
    source.y - BOMBER_EXPLOSION_RADIUS,
    source.x + BOMBER_EXPLOSION_RADIUS,
    source.y + BOMBER_EXPLOSION_RADIUS,
  );

  for (const candidate of candidates) {
    if (
      !candidate.alive ||
      !(candidate instanceof Player) ||
      !canAttackTarget(world, source, candidate)
    ) {
      continue;
    }

    const distance = Math.sqrt(
      getDistanceSquaredToResolvedRectSet(
        candidate.getWorldHitboxes(),
        source.x,
        source.y,
      ),
    );
    if (distance > BOMBER_EXPLOSION_RADIUS) {
      continue;
    }

    new DamageEffect(DAMAGE_PLAYER).apply(world, source, candidate);
  }
}
