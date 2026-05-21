import type { Entity } from "@server/entities/Entity.ts";
import { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";

/**
 * Applies instantaneous server-authoritative healing.
 */
export class HealEffect extends Effect {
  public static override readonly resourceName = "heal";

  constructor(public readonly amount: number) {
    super();
  }

  public override apply(_world: World, _source: Entity, target: Entity): void {
    if (!Number.isFinite(this.amount) || this.amount <= 0 || !target.alive) {
      return;
    }

    target.hp = Math.min(target.maxHp, target.hp + this.amount);
  }
}
