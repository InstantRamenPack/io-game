import { doesResolvedRectIntersectOrientedBox } from "@shared/geometry/collision.ts";
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
    const attackLength = this.getAttackReach(owner, {
      ...aim,
      angle: Math.atan2(aim.directionY, aim.directionX),
    });
    const attackCenterX = owner.x + aim.directionX * (attackLength / 2);
    const attackCenterY = owner.y + aim.directionY * (attackLength / 2);

    for (const rect of target.getWorldHitboxes()) {
      if (
        doesResolvedRectIntersectOrientedBox(
          rect,
          attackCenterX,
          attackCenterY,
          aim.directionX,
          aim.directionY,
          attackLength / 2,
          this.stabWidth / 2,
        )
      ) {
        return true;
      }
    }

    return false;
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
    const attackLength = this.getAttackReach(owner, {
      ...aim,
      angle: Math.atan2(aim.directionY, aim.directionX),
    });
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
