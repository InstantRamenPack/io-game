import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";
import { Player } from "@server/entities/Player.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { NetEvent } from "@shared/net/events.ts";

const BEAM_DAMAGE = 35;
const BEAM_LENGTH = 600;
const BEAM_WIDTH = 70;
const INTERVAL_TICKS = 160; // 8 seconds at 20 tps

// Cardinal angles: East, South, West, North
const CARDINAL_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

/**
 * Fires instant-hit beams in all 4 cardinal directions, damaging any players in their path.
 */
export class WitherCardinalBeamGoal<
  TSelf extends Entity & GoalActor = Entity & GoalActor,
> extends Goal<TSelf> {
  private ticksUntilNext: number;

  constructor(priority: number) {
    super(priority, ["attack"]);
    this.ticksUntilNext = INTERVAL_TICKS;
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    if (!ctx.self.targetId) return false;
    if (this.ticksUntilNext > 0) {
      this.ticksUntilNext--;
      return false;
    }
    return true;
  }

  public override start(_ctx: GoalContext<TSelf>): void {}

  public override tick(ctx: GoalContext<TSelf>): void {
    const { world, self } = ctx;

    for (const angle of CARDINAL_ANGLES) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const perpDx = -dy;
      const perpDy = dx;

      // Find candidates in the beam's bounding box
      const minX = Math.min(self.x, self.x + dx * BEAM_LENGTH) - BEAM_WIDTH / 2;
      const maxX = Math.max(self.x, self.x + dx * BEAM_LENGTH) + BEAM_WIDTH / 2;
      const minY = Math.min(self.y, self.y + dy * BEAM_LENGTH) - BEAM_WIDTH / 2;
      const maxY = Math.max(self.y, self.y + dy * BEAM_LENGTH) + BEAM_WIDTH / 2;

      for (const candidate of world.spatial.queryBox(minX, minY, maxX, maxY)) {
        if (!(candidate instanceof Player) || !candidate.alive) continue;
        if (!DamageEffect.canApply(world, self as unknown as Entity, candidate))
          continue;

        // Check candidate is within the beam rectangle using projection
        const relX = candidate.x - self.x;
        const relY = candidate.y - self.y;
        const along = relX * dx + relY * dy;
        const perp = Math.abs(relX * perpDx + relY * perpDy);

        if (along >= 0 && along <= BEAM_LENGTH && perp <= BEAM_WIDTH / 2) {
          new DamageEffect(BEAM_DAMAGE).apply(
            world,
            self as unknown as Entity,
            candidate,
          );
        }
      }

      // Emit visual event for this beam direction
      const beamEvent: NetEvent = {
        type: "wither_beam",
        payload: {
          sourceId: self.id,
          x: self.x,
          y: self.y,
          angle,
          length: BEAM_LENGTH,
          width: BEAM_WIDTH,
        },
      };
      world.events.push(beamEvent);
    }

    this.ticksUntilNext = INTERVAL_TICKS;
  }

  public override shouldContinue(_ctx: GoalContext<TSelf>): boolean {
    return false;
  }

  public override stop(_ctx: GoalContext<TSelf>): void {}
}
