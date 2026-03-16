import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import type { World } from "@server/world/World.ts";

/**
 * Applies instantaneous server-authoritative damage and emits a damage event.
 */
export class DamageEffect extends Effect {
  readonly amount: number;
  private readonly knockbackEffect: KnockbackEffect;

  constructor(amount: number, knockbackEffect = new KnockbackEffect()) {
    super("damage", "Damage");
    this.amount = amount;
    this.knockbackEffect = knockbackEffect;
  }

  override apply(world: World, source: Entity, target: Entity): void {
    const result = world.applyDamage(source, target, this.amount);
    if (result.applied && !result.isFatal) {
      this.knockbackEffect.apply(world, source, target);
    }
  }
}
