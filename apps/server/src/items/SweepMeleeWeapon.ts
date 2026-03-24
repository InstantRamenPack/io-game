import type { Entity } from "@server/entities/Entity.ts";
import { MeleeWeapon } from "@server/items/MeleeWeapon.ts";

/**
 * Arc-based melee weapon centered on the current aim direction.
 */
export class SweepMeleeWeapon extends MeleeWeapon {
  public sweepArcDegrees: number;

  public constructor(
    fireRate: number,
    range: number,
    hitEffects: ConstructorParameters<typeof MeleeWeapon>[2],
    meleeRange: number,
    sweepArcDegrees: number,
  ) {
    super(fireRate, range, hitEffects, meleeRange);
    this.sweepArcDegrees = sweepArcDegrees;
  }

  protected override isTargetInAttackShape(
    owner: Entity,
    target: Entity,
    aim: {
      directionX: number;
      directionY: number;
    },
  ): boolean {
    const deltaX = target.x - owner.x;
    const deltaY = target.y - owner.y;
    const distance = Math.hypot(deltaX, deltaY);
    const maxDistance = owner.radius + this.meleeRange + target.radius;
    if (distance > maxDistance) {
      return false;
    }
    if (distance <= Number.EPSILON) {
      return true;
    }

    const dot = (deltaX * aim.directionX + deltaY * aim.directionY) / distance;
    const halfArcRadians = (this.sweepArcDegrees * Math.PI) / 360;
    const minDot = Math.cos(halfArcRadians);

    return dot >= minDot;
  }
}
