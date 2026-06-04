import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";
import { Player } from "@server/entities/Player.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import type { NetEvent } from "@shared/net/events.ts";

const INTERVAL_TICKS = 500; // 25 seconds
const WARNING_TICKS = 50;   // 2.5 second warning before explosion
const EXPLOSION_RADIUS = 110;
const EXPLOSION_DAMAGE = 110;
const STRIKE_COUNT = 14;
const SCATTER_RADIUS = 550; // spread across the boss room

type PendingStrike = { x: number; y: number; detonateAtTick: number };

/**
 * Rains down a spread of delayed explosions across the dungeon room.
 * Warns clients before each blast so players can dodge.
 */
export class WitherAirstrikeGoal<
  TSelf extends Entity & GoalActor = Entity & GoalActor,
> extends Goal<TSelf> {
  private ticksUntilNext: number;
  private pendingStrikes: PendingStrike[] = [];
  private active = false;

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

  public override start(ctx: GoalContext<TSelf>): void {
    this.active = true;
    this.pendingStrikes = [];
    const { world, self } = ctx;
    const rng = world.randomNumberGenerator;

    // Generate spread-out strike positions using a grid with random jitter
    const cols = Math.ceil(Math.sqrt(STRIKE_COUNT));
    const rows = Math.ceil(STRIKE_COUNT / cols);
    const cellW = (SCATTER_RADIUS * 2) / cols;
    const cellH = (SCATTER_RADIUS * 2) / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.pendingStrikes.length >= STRIKE_COUNT) break;
        const jitterX = (rng() - 0.5) * cellW * 0.6;
        const jitterY = (rng() - 0.5) * cellH * 0.6;
        const sx = self.x - SCATTER_RADIUS + cellW * (c + 0.5) + jitterX;
        const sy = self.y - SCATTER_RADIUS + cellH * (r + 0.5) + jitterY;
        const detonateAtTick = world.tick + WARNING_TICKS;
        this.pendingStrikes.push({ x: sx, y: sy, detonateAtTick });

        // Emit warning event to client
        const warningEvent: NetEvent = {
          type: "wither_airstrike_warning",
          payload: {
            x: sx,
            y: sy,
            radius: EXPLOSION_RADIUS,
            warningTicks: WARNING_TICKS,
          },
        };
        world.events.push(warningEvent);
      }
    }
  }

  public override tick(ctx: GoalContext<TSelf>): void {
    const { world, self } = ctx;
    const now = world.tick;
    const remaining: PendingStrike[] = [];

    for (const strike of this.pendingStrikes) {
      if (now < strike.detonateAtTick) {
        remaining.push(strike);
        continue;
      }

      // Detonate: damage all players in radius
      for (const candidate of world.spatial.queryBox(
        strike.x - EXPLOSION_RADIUS,
        strike.y - EXPLOSION_RADIUS,
        strike.x + EXPLOSION_RADIUS,
        strike.y + EXPLOSION_RADIUS,
      )) {
        if (!(candidate instanceof Player) || !candidate.alive) continue;
        if (!DamageEffect.canApply(world, self as unknown as Entity, candidate)) continue;

        const dist = Math.hypot(candidate.x - strike.x, candidate.y - strike.y);
        if (dist <= EXPLOSION_RADIUS) {
          new DamageEffect(EXPLOSION_DAMAGE).apply(
            world,
            self as unknown as Entity,
            candidate,
          );
        }
      }

      // Emit explosion visual
      const explosionEvent: NetEvent = {
        type: "explosion",
        payload: {
          sourceId: self.id,
          x: strike.x,
          y: strike.y,
          radius: EXPLOSION_RADIUS,
          style: "wallbreaker",
        },
      };
      world.events.push(explosionEvent);
    }

    this.pendingStrikes = remaining;
    if (this.pendingStrikes.length === 0) {
      this.active = false;
    }
  }

  public override shouldContinue(_ctx: GoalContext<TSelf>): boolean {
    return this.active;
  }

  public override stop(_ctx: GoalContext<TSelf>): void {
    this.active = false;
    this.pendingStrikes = [];
    this.ticksUntilNext = INTERVAL_TICKS;
  }
}
