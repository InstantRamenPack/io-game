import { expandHitboxBounds } from "@shared/geometry/hitbox.ts";
import { canAttackTarget } from "@server/combat/combatRules.ts";
import { Weapon } from "@server/items/Weapon.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";

type MeleeAim = {
  directionX: number;
  directionY: number;
  angle: number;
};

type QueryBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/**
 * Directional melee weapon that can hit multiple nearby targets.
 */
export abstract class MeleeWeapon extends Weapon {
  public meleeRange: number;

  public constructor(
    fireRate: number,
    range: number,
    hitEffects: Effect[],
    meleeRange: number,
  ) {
    super(fireRate, range, hitEffects);
    this.meleeRange = meleeRange;
  }

  public override canHitTarget(
    world: World,
    owner: Entity,
    target: Entity,
  ): boolean {
    if (!this.canHit() || !canAttackTarget(world, owner, target)) {
      return false;
    }

    const aim = this.resolveAim(owner, target.x, target.y);
    if (!aim) {
      return false;
    }

    return this.isTargetInAttackShape(owner, target, aim);
  }

  public override hit(
    world: World,
    owner: Entity,
    aimX: number,
    aimY: number,
  ): boolean {
    if (!this.canHit()) {
      return false;
    }

    const aim = this.resolveAim(owner, aimX, aimY);
    if (!aim) {
      return false;
    }

    owner.rotation = aim.angle;

    const targets = this.resolveTargetsInAttackShape(world, owner, aim);
    if (targets.length === 0) {
      return false;
    }

    for (const target of targets) {
      this.applyHitEffects(world, owner, target);
    }

    this.resetCooldown(world.gameConfig.tickRate);
    return true;
  }

  protected applyHitEffects(world: World, owner: Entity, target: Entity): void {
    for (const effect of this.hitEffects) {
      effect.apply(world, owner, target);
    }
  }

  protected abstract isTargetInAttackShape(
    owner: Entity,
    target: Entity,
    aim: MeleeAim,
  ): boolean;

  protected getAttackQueryBounds(owner: Entity, _aim: MeleeAim): QueryBounds {
    const bounds = expandHitboxBounds(
      owner.getWorldBounds(),
      this.meleeRange,
      this.meleeRange,
    );
    return {
      minX: bounds.minX,
      minY: bounds.minY,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
    };
  }

  protected getAttackReach(owner: Entity, aim: MeleeAim): number {
    return (
      owner.getHitboxDirectionalExtent(aim.directionX, aim.directionY) +
      this.meleeRange
    );
  }

  protected getDistanceAlongAim(
    owner: Entity,
    target: Entity,
    aim: MeleeAim,
  ): number {
    return (
      (target.x - owner.x) * aim.directionX +
      (target.y - owner.y) * aim.directionY
    );
  }

  protected resolveAim(
    owner: Entity,
    aimX: number,
    aimY: number,
  ): MeleeAim | null {
    const deltaX = aimX - owner.x;
    const deltaY = aimY - owner.y;
    const aimDistance = Math.hypot(deltaX, deltaY);
    if (aimDistance <= Number.EPSILON) {
      return null;
    }

    return {
      directionX: deltaX / aimDistance,
      directionY: deltaY / aimDistance,
      angle: Math.atan2(deltaY, deltaX),
    };
  }

  private resolveTargetsInAttackShape(
    world: World,
    owner: Entity,
    aim: MeleeAim,
  ): Entity[] {
    const bounds = this.getAttackQueryBounds(owner, aim);
    const targets: Entity[] = [];

    for (const entity of world.spatial.queryBox(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    )) {
      if (!canAttackTarget(world, owner, entity)) {
        continue;
      }
      if (!this.isTargetInAttackShape(owner, entity, aim)) {
        continue;
      }
      targets.push(entity);
    }

    targets.sort((left, right) => {
      const leftDistance = this.getDistanceAlongAim(owner, left, aim);
      const rightDistance = this.getDistanceAlongAim(owner, right, aim);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      const leftDistanceSquared =
        (left.x - owner.x) * (left.x - owner.x) +
        (left.y - owner.y) * (left.y - owner.y);
      const rightDistanceSquared =
        (right.x - owner.x) * (right.x - owner.x) +
        (right.y - owner.y) * (right.y - owner.y);
      if (leftDistanceSquared !== rightDistanceSquared) {
        return leftDistanceSquared - rightDistanceSquared;
      }

      return left.id - right.id;
    });

    return targets;
  }
}
