import { Enemy } from "@server/entities/Enemy.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { DamageEventPayload, NetEvent } from "@shared/net/events.ts";
import type { World } from "@server/world/World.ts";

/**
 * Applies instantaneous server-authoritative damage and emits a damage event.
 */
export class DamageEffect extends Effect {
  public static override readonly resourceName = "damage";
  public readonly amount: number;

  public constructor(amount: number) {
    super();
    this.amount = amount;
  }

  public override apply(world: World, source: Entity, target: Entity): void {
    const instigator = source.getCombatInstigator(world);
    if (
      !instigator ||
      !world.combat.canAttackTarget(world, source, target) ||
      target.hp === undefined ||
      target.maxHp === undefined ||
      !Number.isFinite(this.amount) ||
      this.amount <= 0
    ) {
      return;
    }

    const nextHp = Math.max(0, Math.min(target.maxHp, target.hp - this.amount));
    if (nextHp === target.hp) {
      return;
    }

    target.hp = nextHp;
    const isFatal = nextHp <= 0;
    const damageEvent: NetEvent = {
      type: "damage",
      tick: world.tick + 1,
      payload: {
        sourceId: instigator.id,
        targetId: target.id,
        amount: this.amount,
        remainingHp: nextHp,
        maxHp: target.maxHp,
        x: target.x,
        y: target.y,
        isFatal,
      } satisfies DamageEventPayload,
    };
    world.events.push(damageEvent);

    if (!isFatal) {
      return;
    }

    if (target instanceof Player) {
      target.handleDeath(world);
      return;
    }

    if (target instanceof Enemy) {
      target.alive = false;
      world.despawn(target.id);
    }
  }
}
