import { ConfusionEffect } from "@server/effects/builtin/ConfusionEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import {
  createStandardMeleeHitEffects,
  requireSwingWeaponContent,
} from "@server/items/weaponContent.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";

const CONFUSION_CHANCE = 0.07;

/**
 * Short-range blunt melee weapon. Rarely inflicts confusion on hit.
 */
export class LeadPipe extends SweepMeleeWeapon {
  public static override readonly resourceName = "lead_pipe";

  private readonly confusionEffect = new ConfusionEffect();

  constructor() {
    const weaponContent = requireSwingWeaponContent(LeadPipe.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createStandardMeleeHitEffects(LeadPipe.typeId),
      weaponContent.sweepArcDeg,
    );
  }

  protected override applyHitEffects(
    world: World,
    owner: Entity,
    target: Entity,
  ): void {
    super.applyHitEffects(world, owner, target);
    if (world.randomNumberGenerator() < CONFUSION_CHANCE) {
      this.confusionEffect.apply(world, owner, target);
    }
  }
}
