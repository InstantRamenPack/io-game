import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import type { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { Goal } from "@server/goals/Goal.ts";
import { MegaknightSlamAreaEffect } from "@server/effects/area/MegaknightSlamAreaEffect.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { goalTargetResolver } from "@server/goals/services/GoalTargetResolver.ts";

type JumpPhase = "windup" | "airborne" | "land";

const WINDUP_TICKS = 8;
const AIRBORNE_TICKS = 3;
const LAND_TICKS = 12;
const COOLDOWN_TICKS = 50;
const ANIMATION_PROFILE_NAME = "jump_attack_animation";

/**
 * Jump attack goal: winds up, leaps to target, lands with AoE damage.
 * Body hitboxes compress while airborne and burst larger on impact.
 */
export class JumpAttackGoal<TSelf extends Enemy = Enemy> extends Goal<TSelf> {
  private phase: JumpPhase | null = null;
  private phaseTick = 0;
  private jumpTargetX = 0;
  private jumpTargetY = 0;
  private cooldownEndTick = 0;

  private readonly baseProfileName: string;
  private readonly baseSize: number;
  private readonly minSize: number;
  private readonly landSize: number;
  private readonly jumpRange: number;
  /**
   * @param priority Lower values run first.
   * @param baseProfileName Profile to restore after the jump sequence ends.
   * @param baseSize Normal hitbox size used for windup interpolation.
   * @param minSize Hitbox size while airborne.
   * @param landSize Peak hitbox size on impact.
   * @param jumpRange Distance to target that triggers the jump.
   */
  constructor(
    priority: number,
    baseProfileName: string,
    baseSize: number,
    minSize: number,
    landSize: number,
    jumpRange: number,
  ) {
    super(priority, ["move", "attack"]);
    this.baseProfileName = baseProfileName;
    this.baseSize = baseSize;
    this.minSize = minSize;
    this.landSize = landSize;
    this.jumpRange = jumpRange;
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    if (this.phase !== null) {
      return false;
    }
    if (ctx.world.tick < this.cooldownEndTick) {
      return false;
    }
    return this.resolveTargetInRange(ctx) !== null;
  }

  public override start(ctx: GoalContext<TSelf>): void {
    this.phase = "windup";
    this.phaseTick = 0;
    ctx.self.setDesiredVelocity(0, 0);
    ctx.self.setHitboxProfile(this.baseProfileName);
    const target = this.resolveTargetInRange(ctx);
    this.jumpTargetX = target?.x ?? ctx.self.x;
    this.jumpTargetY = target?.y ?? ctx.self.y;
  }

  public override tick(ctx: GoalContext<TSelf>): void {
    switch (this.phase) {
      case "windup":
        this.tickWindup(ctx);
        break;
      case "airborne":
        this.tickAirborne(ctx);
        break;
      case "land":
        this.tickLand(ctx);
        break;
    }
    this.phaseTick++;
  }

  public override shouldContinue(_ctx: GoalContext<TSelf>): boolean {
    return this.phase !== null;
  }

  public override stop(ctx: GoalContext<TSelf>): void {
    this.phase = null;
    this.phaseTick = 0;
    ctx.self.setHitboxProfile(this.baseProfileName);
    ctx.self.setDesiredVelocity(0, 0);
  }

  private tickWindup(ctx: GoalContext<TSelf>): void {
    const t = Math.min(1, this.phaseTick / Math.max(1, WINDUP_TICKS - 1));
    const size = Math.round(this.lerp(this.baseSize, this.minSize, t));
    this.setAnimatedSquareHitbox(ctx, size);

    if (this.phaseTick >= WINDUP_TICKS - 1) {
      this.phase = "airborne";
      this.phaseTick = -1;
    }
  }

  private tickAirborne(ctx: GoalContext<TSelf>): void {
    this.setAnimatedSquareHitbox(ctx, this.minSize);

    const remaining = AIRBORNE_TICKS - this.phaseTick;
    const dx = this.jumpTargetX - ctx.self.x;
    const dy = this.jumpTargetY - ctx.self.y;
    const launchVx = dx / Math.max(1, AIRBORNE_TICKS);
    const launchVy = dy / Math.max(1, AIRBORNE_TICKS);

    if (this.phaseTick === 0) {
      ctx.self.applyImpulse(launchVx, launchVy);
    }

    if (remaining <= 1 || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) {
      ctx.self.x = this.jumpTargetX;
      ctx.self.y = this.jumpTargetY;
      ctx.self.resetMovement();
    } else {
      const { momentumVx, momentumVy } = ctx.self.getDebugVelocityComponents();
      ctx.self.steerTowardVelocity(
        dx / remaining - momentumVx,
        dy / remaining - momentumVy,
        Math.hypot(dx / remaining, dy / remaining),
      );
    }

    if (this.phaseTick >= AIRBORNE_TICKS - 1) {
      this.phase = "land";
      this.phaseTick = -1;
    }
  }

  private tickLand(ctx: GoalContext<TSelf>): void {
    if (this.phaseTick === 0) {
      ctx.self.resetMovement();
      this.applyAoeDamage(ctx);
    }

    const half = LAND_TICKS / 2;
    const size =
      this.phaseTick < half
        ? this.lerp(this.minSize, this.landSize, this.phaseTick / half)
        : this.lerp(
            this.landSize,
            this.baseSize,
            (this.phaseTick - half) / half,
          );
    this.setAnimatedSquareHitbox(ctx, Math.round(size));

    if (this.phaseTick >= LAND_TICKS - 1) {
      ctx.self.setHitboxProfile(this.baseProfileName);
      this.cooldownEndTick = ctx.world.tick + COOLDOWN_TICKS;
      this.phase = null;
      this.phaseTick = -1;
    }
  }

  private applyAoeDamage(ctx: GoalContext<TSelf>): void {
    new MegaknightSlamAreaEffect().apply(ctx.world, ctx.self, {
      x: ctx.self.x,
      y: ctx.self.y,
    });
  }

  private setAnimatedSquareHitbox(ctx: GoalContext<TSelf>, size: number): void {
    ctx.self.setHitboxProfileRects(ANIMATION_PROFILE_NAME, [
      makeHitboxRect(size, size),
    ]);
    ctx.self.setHitboxProfile(ANIMATION_PROFILE_NAME);
  }

  private resolveTarget(ctx: GoalContext<TSelf>): Player | null {
    return goalTargetResolver.resolveTrackedLivingTarget(ctx, Player);
  }

  private resolveTargetInRange(ctx: GoalContext<TSelf>): Player | null {
    const target = this.resolveTarget(ctx);
    if (!target) {
      return null;
    }
    const dx = target.x - ctx.self.x;
    const dy = target.y - ctx.self.y;
    return dx * dx + dy * dy <= this.jumpRange * this.jumpRange ? target : null;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}
