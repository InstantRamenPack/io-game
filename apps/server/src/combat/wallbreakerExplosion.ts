import { getDistanceSquaredToResolvedRectSet } from "@shared/geometry/collision.ts";
import type { NetEvent } from "@shared/net/events.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { canAttackTarget } from "@server/combat/combatRules.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

export const WALLBREAKER_EXPLOSION_RADIUS = 90;

const DAMAGE_WALL = 200;
const DAMAGE_BUILDING = 80;
const DAMAGE_PLAYER = 200;

/**
 * Explosion that one-shots walls and players, deals moderate damage to other buildings.
 */
export function triggerWallbreakerExplosion(
  world: World,
  source: Entity,
): void {
  const explosionEvent: NetEvent = {
    type: "explosion",
    tick: world.tick + 1,
    payload: {
      sourceId: source.id,
      x: source.x,
      y: source.y,
      radius: WALLBREAKER_EXPLOSION_RADIUS,
      style: "wallbreaker",
    },
  };
  world.events.push(explosionEvent);

  const candidates = world.spatial.queryBox(
    source.x - WALLBREAKER_EXPLOSION_RADIUS,
    source.y - WALLBREAKER_EXPLOSION_RADIUS,
    source.x + WALLBREAKER_EXPLOSION_RADIUS,
    source.y + WALLBREAKER_EXPLOSION_RADIUS,
  );

  for (const candidate of candidates) {
    if (!candidate.alive || !canAttackTarget(world, source, candidate)) {
      continue;
    }

    const distance = Math.sqrt(
      getDistanceSquaredToResolvedRectSet(
        candidate.getWorldHitboxes(),
        source.x,
        source.y,
      ),
    );
    if (distance > WALLBREAKER_EXPLOSION_RADIUS) {
      continue;
    }

    const damage =
      candidate instanceof Wall
        ? DAMAGE_WALL
        : candidate instanceof Player
          ? DAMAGE_PLAYER
          : DAMAGE_BUILDING;

    new DamageEffect(damage).apply(world, source, candidate);
  }
}
