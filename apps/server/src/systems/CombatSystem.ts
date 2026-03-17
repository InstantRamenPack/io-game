import { Enemy } from "@server/entities/Enemy.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import type { DamageEventPayload, NetEvent } from "@shared/net/events.ts";
import type { World } from "@server/world/World.ts";

/**
 * Owns combat rules, damage application, and death outcomes.
 */
export class CombatSystem {
  /**
   * Returns whether the source can deal damage to the target in this combat pass.
   * @param source Attacking entity.
   * @param target Potential target.
   * @returns True when the matchup is allowed.
   */
  canAttackTarget(source: Entity, target: Entity): boolean {
    if (!source.alive || !target.alive || source.id === target.id) {
      return false;
    }

    if (source instanceof Player) {
      return target instanceof Enemy || target instanceof Player;
    }
    if (source instanceof Enemy) {
      return target instanceof Player;
    }
    return false;
  }

  /**
   * Applies authoritative damage, emits an event, and handles death/respawn outcomes.
   * @param world World being mutated by the combat resolution.
   * @param source Attacking entity.
   * @param target Damaged entity.
   * @param amount Positive damage amount.
   * @returns True when damage was applied.
   */
  applyDamage(
    world: World,
    source: Entity,
    target: Entity,
    amount: number,
  ): { applied: boolean; isFatal: boolean } {
    if (
      !this.canAttackTarget(source, target) ||
      target.hp === undefined ||
      target.maxHp === undefined ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return { applied: false, isFatal: false };
    }

    const nextHp = Math.max(0, Math.min(target.maxHp, target.hp - amount));
    if (nextHp === target.hp) {
      return { applied: false, isFatal: false };
    }

    target.hp = nextHp;
    const isFatal = nextHp <= 0;
    const damageEvent: NetEvent = {
      type: "damage",
      tick: world.tick + 1,
      payload: {
        sourceId: source.id,
        targetId: target.id,
        amount,
        remainingHp: nextHp,
        maxHp: target.maxHp,
        x: target.x,
        y: target.y,
        isFatal,
      } satisfies DamageEventPayload,
    };
    world.events.push(damageEvent);

    if (!isFatal) {
      return { applied: true, isFatal: false };
    }

    if (target instanceof Player) {
      target.hp = target.maxHp;
      target.x = world.gameConfig.worldSize.w / 2;
      target.y = world.gameConfig.worldSize.h / 2;
      target.resetVelocity();
      return { applied: true, isFatal: true };
    }

    if (target instanceof Enemy) {
      target.alive = false;
      world.despawn(target.id);
    }

    return { applied: true, isFatal: true };
  }
}
