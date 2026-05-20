import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";
import {
  createMeleeHitEffectsForWeapon,
  requireSwingWeaponRuntime,
} from "@server/combat/contentAdapters.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import type { World } from "@server/world/World.ts";

const STUN_CHANCE = 0.25;

export class Crowbar extends SweepMeleeWeapon {
  public static override readonly resourceName = "crowbar";

  private readonly stunnedEffect = new StunnedEffect();

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(Crowbar.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeHitEffectsForWeapon(Crowbar.typeId),
      weaponContent.sweepArcDeg,
    );
  }

  protected override applyHitEffects(
    world: World,
    owner: Entity,
    target: Entity,
  ): void {
    super.applyHitEffects(world, owner, target);
    if (world.randomNumberGenerator() < STUN_CHANCE) {
      this.stunnedEffect.apply(world, owner, target);
    }
  }
}
