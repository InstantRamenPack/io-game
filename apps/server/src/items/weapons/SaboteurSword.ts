import { Building } from "@server/entities/Building.ts";
import { requireSwingWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";

const BUILDING_DAMAGE_MULTIPLIER = 1;
const PLAYER_DAMAGE_MULTIPLIER = 0.5;

/**
 * Saboteur sword keeps all base combat stats in shared JSON and applies
 * target-type multipliers only as runtime behavior.
 */
export class SaboteurSword extends SweepMeleeWeapon {
  public static override readonly resourceName = "saboteur_sword";

  private readonly buildingDamageEffect: DamageEffect;
  private readonly playerDamageEffect: DamageEffect;
  private readonly knockbackEffect: KnockbackEffect;

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(SaboteurSword.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      [],
      weaponContent.sweepArcDeg,
    );
    this.buildingDamageEffect = new DamageEffect(
      weaponContent.damage * BUILDING_DAMAGE_MULTIPLIER,
    );
    this.playerDamageEffect = new DamageEffect(
      weaponContent.damage * PLAYER_DAMAGE_MULTIPLIER,
    );
    this.knockbackEffect = new KnockbackEffect(weaponContent.knockback);
  }

  protected override applyHitEffects(
    world: World,
    owner: Entity,
    target: Entity,
  ): void {
    const damageEffect =
      target instanceof Building
        ? this.buildingDamageEffect
        : this.playerDamageEffect;
    damageEffect.apply(world, owner, target);
    this.knockbackEffect.apply(world, owner, target);
  }
}
