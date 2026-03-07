import { Weapon } from "./Weapon.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ItemKind } from "@shared/ids/ItemKinds.ts";

/**
 * Melee weapon that hits nearby targets.
 */
export class MeleeWeapon extends Weapon {
  meleeRange: number;

  constructor(
    id: number,
    damage: number,
    fireRate: number,
    range: number,
    hitEffects: string[],
    meleeRange: number
  ) {
    super(id, "weapon" as ItemKind, damage, fireRate, range, hitEffects);
    this.meleeRange = meleeRange;
  }

  fire(world: World, owner: Entity, aimX: number, aimY: number): void {
    if (!this.canFire()) return;

    // Hit query in melee range (placeholder; integrate with CombatSystem)
    // const targets = world.queryNearby(owner.x, owner.y, this.meleeRange);
    // for (const target of targets) {
    //   if (target !== owner) {
    //     // apply damage and effects
    //   }
    // }

    this.resetCooldown();
  }
}