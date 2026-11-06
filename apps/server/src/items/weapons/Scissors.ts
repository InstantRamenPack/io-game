import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";
import type { World } from "@server/world/World.ts";

const BLEED_CHANCE = 0.1;

/**
 * Short stabbing weapon with a small bleed proc chance.
 */
export class Scissors extends StabMeleeWeapon {
  public static override readonly resourceName = "scissors";

  private readonly bleedingEffect = new BleedingEffect();

  protected override applyHitEffects(
    world: World,
    owner: Entity,
    target: Entity,
  ): void {
    super.applyHitEffects(world, owner, target);
    if (world.randomNumberGenerator() < BLEED_CHANCE) {
      this.bleedingEffect.apply(world, owner, target);
    }
  }
}
