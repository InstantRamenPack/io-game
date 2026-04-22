import { expandHitboxBounds } from "@shared/geometry/hitbox.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import { combatEligibilityService } from "@server/combat/CombatEligibilityService.ts";
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
  public range: number;
  public hitEffects: Effect[];

  protected constructor(
    cooldownTicks: number,
    range: number,
    hitEffects: Effect[],
  ) {
    super(cooldownTicks);
    this.range = range;
    this.hitEffects = hitEffects;
  }

  public override canHitTarget(
    world: World,
    owner: Entity,
    target: Entity,
  ): boolean {
    if (
      !this.canHit() ||
      !combatEligibilityService.canAttackTarget(world, owner, target)
    ) {
      return false;
    }

    const aim = this.resolveAim(
      Math.atan2(target.y - owner.y, target.x - owner.x),
    );

    return this.isTargetInAttackShape(owner, target, aim);
  }

  public override hit(world: World, owner: Entity, theta: number): boolean {
    if (!this.canHit()) {
      return false;
    }

    const aim = this.resolveAim(theta);

    owner.rotation = aim.angle;

    const targets = this.resolveTargetsInAttackShape(world, owner, aim);
    if (targets.length === 0) {
      return false;
    }

    for (const target of targets) {
      this.applyHitEffects(world, owner, target);
    }

    this.resetCooldown();
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
      this.range,
      this.range,
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
      this.range
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

  protected resolveAim(theta: number): MeleeAim {
    const angle = normalizeAngle(theta);
    return {
      directionX: Math.cos(angle),
      directionY: Math.sin(angle),
      angle,
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
      if (!combatEligibilityService.canAttackTarget(world, owner, entity)) {
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
