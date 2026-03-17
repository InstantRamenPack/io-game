import { Weapon } from "./Weapon.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Melee weapon that hits nearby targets.
 */
export class MeleeWeapon extends Weapon {
  meleeRange: number;

  constructor(
    id: number,
    typeId: ResourceId,
    damage: number,
    fireRate: number,
    range: number,
    hitEffects: Effect[],
    meleeRange: number,
  ) {
    super(id, typeId, damage, fireRate, range, hitEffects);
    this.meleeRange = meleeRange;
  }

  override fire(world: World, owner: Entity, aimX: number, aimY: number): void {
    this.tryAttackAtPoint(world, owner, aimX, aimY);
  }

  tryAttackAtPoint(
    world: World,
    owner: Entity,
    aimX: number,
    aimY: number,
  ): boolean {
    if (!this.canFire()) {
      return false;
    }

    const target = this.resolveTargetAtPoint(world, owner, aimX, aimY);
    if (!target) {
      return false;
    }

    return this.tryAttackEntity(world, owner, target);
  }

  tryAttackEntity(world: World, owner: Entity, target: Entity): boolean {
    if (!this.canFire()) {
      return false;
    }
    if (
      !world.canAttackTarget(owner, target) ||
      !this.isTargetInRange(owner, target)
    ) {
      return false;
    }

    this.hit(world, owner, target);
    this.resetCooldown(world.gameConfig.tickRate);
    return true;
  }

  hit(world: World, owner: Entity, target: Entity): void {
    for (const effect of this.hitEffects) {
      effect.apply(world, owner, target);
    }
  }

  isTargetInRange(owner: Entity, target: Entity): boolean {
    const distance = Math.hypot(target.x - owner.x, target.y - owner.y);
    return distance <= owner.radius + target.radius + this.meleeRange;
  }

  private resolveTargetAtPoint(
    world: World,
    owner: Entity,
    aimX: number,
    aimY: number,
  ): Entity | null {
    let bestTarget: Entity | null = null;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const entity of world.entities.all()) {
      if (!entity.containsPoint(aimX, aimY)) {
        continue;
      }
      if (
        !world.canAttackTarget(owner, entity) ||
        !this.isTargetInRange(owner, entity)
      ) {
        continue;
      }

      const deltaX = entity.x - aimX;
      const deltaY = entity.y - aimY;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared >= bestDistanceSquared) {
        continue;
      }

      bestTarget = entity;
      bestDistanceSquared = distanceSquared;
    }

    return bestTarget;
  }
}
