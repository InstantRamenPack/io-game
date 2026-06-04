import { RangedWeapon } from "@server/items/RangedWeapon.ts";
import { Player } from "@server/entities/Player.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { NetEvent } from "@shared/net/events.ts";

// Beam dimensions: width = ~double player size (~64px wide), length = 600 units
const BEAM_WIDTH = 64;
const BEAM_LENGTH = 600;
const BEAM_DAMAGE_PER_TICK = 45;

// Charge constants: magSize=2400 ticks = 120s at 20tps = 2 minutes
// Scrap hunk: 500 at full charge, 50 at empty, proportional
export const STREAKER_FULL_HUNK = 500;
export const STREAKER_EMPTY_HUNK = 50;

export class Streaker extends RangedWeapon {
  public static override readonly resourceName = "streaker";

  constructor() {
    super(
      1, // cooldownTicks: fires every tick
      "projectile:thanos_bullet" as never, // placeholder; never actually fired
      2400, // magSize = 2400 ticks = 2 min uptime
      99999, // reloadTicks: impossibly long, canReload() blocks it anyway
      0, // spread
      undefined, // no magItemTypeId
    );
  }

  /** Never reload — once charge is gone, the Streaker is depleted. */
  protected override canReload(_owner: Entity | undefined): boolean {
    return false;
  }

  /** Fire a beam: damage all players in a rectangle in front of the owner. */
  public override hit(world: World, owner: Entity, theta: number): boolean {
    if (!this.canHit()) {
      return false;
    }

    owner.rotation = theta;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    const perpDx = -dy;
    const perpDy = dx;

    // Bounding box for the beam rectangle
    const minX = Math.min(owner.x, owner.x + dx * BEAM_LENGTH) - BEAM_WIDTH / 2;
    const maxX = Math.max(owner.x, owner.x + dx * BEAM_LENGTH) + BEAM_WIDTH / 2;
    const minY = Math.min(owner.y, owner.y + dy * BEAM_LENGTH) - BEAM_WIDTH / 2;
    const maxY = Math.max(owner.y, owner.y + dy * BEAM_LENGTH) + BEAM_WIDTH / 2;

    for (const candidate of world.spatial.queryBox(minX, minY, maxX, maxY)) {
      if (
        !(candidate instanceof Player) ||
        !candidate.alive ||
        candidate.id === owner.id
      ) {
        continue;
      }
      if (!DamageEffect.canApply(world, owner, candidate)) continue;

      // Check candidate is within beam rectangle via projection
      const relX = candidate.x - owner.x;
      const relY = candidate.y - owner.y;
      const along = relX * dx + relY * dy;
      const perp = Math.abs(relX * perpDx + relY * perpDy);

      if (along >= 0 && along <= BEAM_LENGTH && perp <= BEAM_WIDTH / 2) {
        new DamageEffect(BEAM_DAMAGE_PER_TICK).apply(world, owner, candidate);
      }
    }

    // Emit beam visual event
    const beamEvent: NetEvent = {
      type: "wither_beam",
      payload: {
        sourceId: owner.id,
        x: owner.x,
        y: owner.y,
        angle: theta,
        length: BEAM_LENGTH,
        width: BEAM_WIDTH,
      },
    };
    world.events.push(beamEvent);

    this.ammoInMag--;
    this.resetCooldown();
    return true;
  }

  /** Returns hunk proportional to remaining charge (50 at 0%, 500 at 100%). */
  public override getRecycleHunkValue(): number {
    const ratio = this.magSize > 0 ? this.ammoInMag / this.magSize : 0;
    return Math.round(
      STREAKER_EMPTY_HUNK + ratio * (STREAKER_FULL_HUNK - STREAKER_EMPTY_HUNK),
    );
  }
}
