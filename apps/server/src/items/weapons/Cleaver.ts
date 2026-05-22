import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireSwingWeaponRuntime,
} from "@server/combat/contentAdapters.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import type { World } from "@server/world/World.ts";

const BLEED_CHANCE = 0.4;

/**
 * Short sweep weapon with a moderate bleed proc chance.
 */
export class Cleaver extends SweepMeleeWeapon {
  public static override readonly resourceName = "cleaver";

  private readonly bleedingEffect = new BleedingEffect();

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(Cleaver.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(Cleaver.typeId),
      weaponContent.sweepArcDeg,
    );
  }

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
