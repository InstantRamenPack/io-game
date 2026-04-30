import { doesResolvedRectIntersectSweepArc } from "@shared/geometry/collision.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { Effect } from "@server/effects/Effect.ts";
import { MeleeWeapon } from "@server/items/MeleeWeapon.ts";

/**
 * Arc-based melee weapon centered on the current aim direction.
 */
export class SweepMeleeWeapon extends MeleeWeapon {
  public sweepArcDegrees: number;

  constructor(
    cooldownTicks: number,
    range: number,
    hitEffects: Effect[],
    sweepArcDegrees: number,
  ) {
    super(cooldownTicks, range, hitEffects);
    this.sweepArcDegrees = sweepArcDegrees;
  }

  protected override isTargetInAttackShape(
    owner: Entity,
    target: Entity,
    aim: {
      directionX: number;
      directionY: number;
      angle?: number;
    },
  ): boolean {
    const angle = aim.angle ?? Math.atan2(aim.directionY, aim.directionX);
    const maxDistance = this.getAttackReach(owner, { ...aim, angle });
    const halfArcRadians = (this.sweepArcDegrees * Math.PI) / 360;

    for (const rect of target.getWorldHitboxes()) {
      if (
        doesResolvedRectIntersectSweepArc(
          rect,
          owner.x,
          owner.y,
          angle,
          aim.directionX,
          aim.directionY,
          maxDistance,
          halfArcRadians,
        )
      ) {
        return true;
      }
    }

    return false;
  }
}
