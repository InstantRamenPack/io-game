import { Building } from "@server/entities/Building.ts";
import { requireSwingWeaponRuntime } from "@server/combat/contentAdapters.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { SweepMeleeWeapon } from "@server/items/SweepMeleeWeapon.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";

const BUILDING_DAMAGE = 10;
const PLAYER_DAMAGE = 3;

/**
 * Sword used by the Saboteur. Deals double damage to buildings and half damage to players.
 */
export class SaboteurSword extends SweepMeleeWeapon {
  public static override readonly resourceName = "saboteur_sword";

  private readonly buildingDamageEffect = new DamageEffect(BUILDING_DAMAGE);
  private readonly playerDamageEffect = new DamageEffect(PLAYER_DAMAGE);
  private readonly knockbackEffect = new KnockbackEffect();

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(SaboteurSword.typeId);
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      [],
      weaponContent.sweepArcDeg,
    );
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
