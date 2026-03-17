import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";

/**
 * Applies instantaneous server-authoritative damage and emits a damage event.
 */
export class DamageEffect extends Effect {
  readonly amount: number;

  constructor(amount: number) {
    super("damage", "Damage");
    this.amount = amount;
  }

  override apply(world: World, source: Entity, target: Entity): void {
    world.combat.applyDamage(world, source, target, this.amount);
  }
}
