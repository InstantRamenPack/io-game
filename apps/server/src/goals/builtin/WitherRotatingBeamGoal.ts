import type { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";
import { Player } from "@server/entities/Player.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { requireGameTypeEntry } from "@server/registry/registries.ts";
import { isProjectileCtor } from "@server/runtime/ctorGuards.ts";
import type { NetEvent } from "@shared/net/events.ts";

const BULLET_TYPE_ID = "projectile:thanos_bullet" as const;

const BEAM_DAMAGE_PER_TICK = 4;
const BEAM_LENGTH = 580;
const BEAM_WIDTH = 65;
const DURATION_TICKS = 140; // 7 seconds
const INTERVAL_TICKS = 420; // 21 seconds between activations
// 2 full clockwise rotations over the duration
const ROTATION_PER_TICK = (2 * 2 * Math.PI) / DURATION_TICKS;
const BULLET_INTERVAL_TICKS = 25; // fire bullets at players every 25 ticks
const BULLET_SEEK_RADIUS = 900;

/**
 * Rotates 4 beams clockwise for ~7 seconds while also shooting bullets at nearby players.
 */
export class WitherRotatingBeamGoal<
  TSelf extends Entity & GoalActor = Entity & GoalActor,
> extends Goal<TSelf> {
  private ticksUntilNext: number;
  private ticksRemaining = 0;
  private beamAngle = 0;
  private bulletCooldown = 0;

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

  public override start(_ctx: GoalContext<TSelf>): void {
    this.ticksRemaining = DURATION_TICKS;
    this.beamAngle = 0;
    this.bulletCooldown = 0;
  }

  public override tick(ctx: GoalContext<TSelf>): void {
    const { world, self } = ctx;
    this.ticksRemaining--;

    // Fire 4 rotating beams at the current angle offset
    for (let i = 0; i < 4; i++) {
      const angle = this.beamAngle + (i * Math.PI) / 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const perpDx = -dy;
      const perpDy = dx;

      const minX = Math.min(self.x, self.x + dx * BEAM_LENGTH) - BEAM_WIDTH / 2;
      const maxX = Math.max(self.x, self.x + dx * BEAM_LENGTH) + BEAM_WIDTH / 2;
      const minY = Math.min(self.y, self.y + dy * BEAM_LENGTH) - BEAM_WIDTH / 2;
      const maxY = Math.max(self.y, self.y + dy * BEAM_LENGTH) + BEAM_WIDTH / 2;

      for (const candidate of world.spatial.queryBox(minX, minY, maxX, maxY)) {
        if (!(candidate instanceof Player) || !candidate.alive) continue;
        if (!DamageEffect.canApply(world, self as unknown as Entity, candidate))
          continue;

        const relX = candidate.x - self.x;
        const relY = candidate.y - self.y;
        const along = relX * dx + relY * dy;
        const perp = Math.abs(relX * perpDx + relY * perpDy);

        if (along >= 0 && along <= BEAM_LENGTH && perp <= BEAM_WIDTH / 2) {
          new DamageEffect(BEAM_DAMAGE_PER_TICK).apply(
            world,
            self as unknown as Entity,
            candidate,
          );
        }
      }

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

    // Advance rotation clockwise
    this.beamAngle += ROTATION_PER_TICK;

    // Periodically fire bullets at all nearby players
    if (this.bulletCooldown <= 0) {
      this.fireBulletsAtPlayers(ctx);
      this.bulletCooldown = BULLET_INTERVAL_TICKS;
    } else {
      this.bulletCooldown--;
    }
  }

  public override shouldContinue(_ctx: GoalContext<TSelf>): boolean {
    return this.ticksRemaining > 0;
  }

  public override stop(_ctx: GoalContext<TSelf>): void {
    this.ticksUntilNext = INTERVAL_TICKS;
  }

  private fireBulletsAtPlayers(ctx: GoalContext<TSelf>): void {
    const { world, self } = ctx;
    const projectileEntry = requireGameTypeEntry(BULLET_TYPE_ID, "entity");
    if (!isProjectileCtor(projectileEntry.ctor)) return;
    const BulletCtor = projectileEntry.ctor;

    for (const candidate of world.spatial.queryBox(
      self.x - BULLET_SEEK_RADIUS,
      self.y - BULLET_SEEK_RADIUS,
      self.x + BULLET_SEEK_RADIUS,
      self.y + BULLET_SEEK_RADIUS,
    )) {
      if (!(candidate instanceof Player) || !candidate.alive) continue;
      if (!DamageEffect.canApply(world, self as unknown as Entity, candidate))
        continue;

      const dist = Math.hypot(candidate.x - self.x, candidate.y - self.y);
      if (dist > BULLET_SEEK_RADIUS) continue;

      const angle = Math.atan2(candidate.y - self.y, candidate.x - self.x);
      const bullet = new BulletCtor(world.allocEntityId(), {
        ownerId: self.id,
        x: self.x + Math.cos(angle) * 36,
        y: self.y + Math.sin(angle) * 36,
        directionX: Math.cos(angle),
        directionY: Math.sin(angle),
        rotation: angle,
      });
      world.spawn(bullet);
    }
  }
}
