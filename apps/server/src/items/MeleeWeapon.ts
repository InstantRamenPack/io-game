import { expandHitboxBounds } from "@shared/geometry/hitbox.ts";
import { normalizeAngle } from "@shared/math/angle.ts";
import {
  COMBAT_OCCLUSION_EPSILON,
  getBlockerRayEntryDistance,
  getEntityRayEntryDistance,
} from "@server/combat/CombatOcclusion.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { Weapon } from "@server/items/Weapon.ts";
import type { Effect } from "@server/effects/Effect.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { requireWeaponContent } from "@shared/content/catalog.ts";
import type { AttackStyle } from "@shared/content/schema.ts";

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

type AttackHitCandidate = {
  target: Entity;
  entryDistance: number;
  tieBreakerDistanceSquared: number;
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
    if (!this.canReachTarget(world, owner, target)) {
      return false;
    }

    const aim = this.resolveAim(
      Math.atan2(target.y - owner.y, target.x - owner.x),
    );

    return this.resolveTargetsInAttackShape(world, owner, aim).some(
      (candidate) => candidate.id === target.id,
    );
  }

  public canReachTarget(world: World, owner: Entity, target: Entity): boolean {
    if (!this.canHit() || !DamageEffect.canApply(world, owner, target)) {
      return false;
    }

    const aim = this.resolveAim(
      Math.atan2(target.y - owner.y, target.x - owner.x),
    );

    return this.isTargetInAttackShape(owner, target, aim);
  }

  public override scaleAttackRange(multiplier: number): void {
    this.range *= multiplier;
  }

  public override hit(world: World, owner: Entity, theta: number): boolean {
    if (!this.canHit()) {
      return false;
    }

    const aim = this.resolveAim(theta);

    owner.rotation = aim.angle;

    const targets = this.resolveTargetsInAttackShape(world, owner, aim);
    if (targets.length > 0) {
      for (const target of targets) {
        this.applyHitEffects(world, owner, target);
      }
    }

    const instigator = owner.getCombatInstigator(world);
    const attackEvent: NetEvent = {
      type: "attack",
      payload: {
        sourceId: instigator?.id ?? owner.id,
        x: owner.x,
        y: owner.y,
        attackStyle: this.getAttackStyleForEvent(),
      },
    };
    world.events.push(attackEvent);

    // Consume cooldown on swing attempt so melee behavior matches client
    // expectations and remote spectators can observe attack animations even on whiff.
    this.resetCooldown();
    return true;
  }

  protected getAttackStyleForEvent(): AttackStyle {
    return requireWeaponContent(this.typeId).attackStyle;
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
    const attackReach = this.getAttackReach(owner, aim);
    const targets: AttackHitCandidate[] = [];
    let nearestBlockerDistance: number | null = null;

    for (const blocker of world.staticGeometry.queryBox(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    )) {
      const entryDistance = getBlockerRayEntryDistance(
        blocker,
        owner.x,
        owner.y,
        aim.directionX,
        aim.directionY,
      );
      if (entryDistance === null || entryDistance > attackReach) {
        continue;
      }
      if (
        nearestBlockerDistance === null ||
        entryDistance < nearestBlockerDistance
      ) {
        nearestBlockerDistance = entryDistance;
      }
    }

    for (const entity of world.spatial.queryBox(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    )) {
      if (!this.isTargetInAttackShape(owner, entity, aim)) {
        continue;
      }

      const entryDistance = getEntityRayEntryDistance(
        entity,
        owner.x,
        owner.y,
        aim.directionX,
        aim.directionY,
      );
      if (entryDistance === null || entryDistance > attackReach) {
        continue;
      }

      if (!DamageEffect.canApply(world, owner, entity)) {
        continue;
      }

      const tieBreakerDistanceSquared =
        (entity.x - owner.x) * (entity.x - owner.x) +
        (entity.y - owner.y) * (entity.y - owner.y);
      targets.push({
        target: entity,
        entryDistance,
        tieBreakerDistanceSquared,
      });
    }

    targets.sort((left, right) => {
      if (left.entryDistance !== right.entryDistance) {
        return left.entryDistance - right.entryDistance;
      }
      if (left.tieBreakerDistanceSquared !== right.tieBreakerDistanceSquared) {
        return left.tieBreakerDistanceSquared - right.tieBreakerDistanceSquared;
      }

      return left.target.id - right.target.id;
    });

    const maxVisibleDistance =
      nearestBlockerDistance === null
        ? null
        : nearestBlockerDistance + COMBAT_OCCLUSION_EPSILON;

    return targets
      .filter(
        (candidate) =>
          maxVisibleDistance === null ||
          candidate.entryDistance <= maxVisibleDistance,
      )
      .map((candidate) => candidate.target);
  }
}
