import { Weapon } from "@server/items/Weapon.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Melee weapon that hits nearby targets.
 */
export class MeleeWeapon extends Weapon {
  public meleeRange: number;

  public constructor(
    id: number,
    typeId: ResourceId,
    fireRate: number,
    range: number,
    hitEffects: Effect[],
    meleeRange: number,
  ) {
    super(id, typeId, fireRate, range, hitEffects);
    this.meleeRange = meleeRange;
  }

  public override fire(
    world: World,
    owner: Entity,
    aimX: number,
    aimY: number,
  ): void {
    this.tryAttackAtPoint(world, owner, aimX, aimY);
  }

  public tryAttackAtPoint(
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

  public tryAttackEntity(world: World, owner: Entity, target: Entity): boolean {
    if (!this.canFire()) {
      return false;
    }
    if (
      !world.combat.canAttackTarget(world, owner, target) ||
      !this.isTargetInRange(owner, target)
    ) {
      return false;
    }

    this.hit(world, owner, target);
    this.resetCooldown(world.gameConfig.tickRate);
    return true;
  }

  public hit(world: World, owner: Entity, target: Entity): void {
    for (const effect of this.hitEffects) {
      effect.apply(world, owner, target);
    }
  }

  public isTargetInRange(owner: Entity, target: Entity): boolean {
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
        !world.combat.canAttackTarget(world, owner, entity) ||
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
