import { Building } from "@server/entities/Building.ts";
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

  constructor(amount: number) {
    super();
    this.amount = amount;
  }

  public static resolveInstigator(world: World, source: Entity): Entity | null {
    const instigator = source.getCombatInstigator(world);
    if (!instigator || !instigator.alive) {
      return null;
    }
    return instigator;
  }

  public static canApply(
    world: World,
    source: Entity,
    target: Entity,
  ): boolean {
    const instigator = DamageEffect.resolveInstigator(world, source);
    if (!instigator || !target.alive || instigator.id === target.id) {
      return false;
    }

    if (instigator instanceof Player) {
      return target instanceof Enemy || target instanceof Player;
    }
    if (instigator instanceof Enemy) {
      return target instanceof Player || target instanceof Building;
    }

    return false;
  }

  public override apply(world: World, source: Entity, target: Entity): void {
    const instigator = DamageEffect.resolveInstigator(world, source);
    if (
      !instigator ||
      !DamageEffect.canApply(world, source, target) ||
      !Number.isFinite(this.amount) ||
      this.amount <= 0
    ) {
      return;
    }

    const effectiveAmount =
      this.amount *
      instigator.damageMultiplier *
      target.getDamageReductionMultiplier();
    const nextHp = Math.max(
      0,
      Math.min(target.maxHp, target.hp - effectiveAmount),
    );
    if (nextHp === target.hp) {
      return;
    }

    target.hp = nextHp;
    target.lastDamageTick = world.tick;
    const isFatal = nextHp <= 0;
    const damageEvent: NetEvent = {
      type: "damage",
      payload: {
        sourceId: instigator.id,
        targetId: target.id,
        targetTypeId: target.typeId,
        amount: effectiveAmount,
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

    target.handleDeath(world);
  }
}
