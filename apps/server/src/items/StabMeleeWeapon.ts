import type { Entity } from "@server/entities/Entity.ts";
import { MeleeWeapon } from "@server/items/MeleeWeapon.ts";

/**
 * Corridor-based melee weapon aligned with the current aim direction.
 */
export class StabMeleeWeapon extends MeleeWeapon {
  public stabWidth: number;

  public constructor(
    fireRate: number,
    range: number,
    hitEffects: ConstructorParameters<typeof MeleeWeapon>[2],
    meleeRange: number,
    stabWidth: number,
  ) {
    super(fireRate, range, hitEffects, meleeRange);
    this.stabWidth = stabWidth;
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
    const forwardDistance = deltaX * aim.directionX + deltaY * aim.directionY;
    const maxForwardDistance = owner.radius + this.meleeRange + target.radius;
    if (forwardDistance < 0 || forwardDistance > maxForwardDistance) {
      return false;
    }

    const lateralDistance = Math.abs(
      deltaX * -aim.directionY + deltaY * aim.directionX,
    );
    return lateralDistance <= this.stabWidth / 2 + target.radius;
  }

  protected override getAttackQueryBounds(
    owner: Entity,
    aim: {
      directionX: number;
      directionY: number;
    },
  ): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const attackLength = owner.radius + this.meleeRange;
    const halfWidth = this.stabWidth / 2;
    const perpendicularX = -aim.directionY;
    const perpendicularY = aim.directionX;
    const endX = owner.x + aim.directionX * attackLength;
    const endY = owner.y + aim.directionY * attackLength;
    const corners = [
      {
        x: owner.x + perpendicularX * halfWidth,
        y: owner.y + perpendicularY * halfWidth,
      },
      {
        x: owner.x - perpendicularX * halfWidth,
        y: owner.y - perpendicularY * halfWidth,
      },
      {
        x: endX + perpendicularX * halfWidth,
        y: endY + perpendicularY * halfWidth,
      },
      {
        x: endX - perpendicularX * halfWidth,
        y: endY - perpendicularY * halfWidth,
      },
    ];

    return {
      minX: Math.min(...corners.map((corner) => corner.x)),
      minY: Math.min(...corners.map((corner) => corner.y)),
      maxX: Math.max(...corners.map((corner) => corner.x)),
      maxY: Math.max(...corners.map((corner) => corner.y)),
    };
  }
}
