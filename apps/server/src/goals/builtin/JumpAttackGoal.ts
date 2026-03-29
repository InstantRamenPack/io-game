import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import type { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { Goal } from "@server/goals/Goal.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";

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
  private readonly aoeDamage: number;
  private readonly aoeRadius: number;

  /**
   * @param priority Lower values run first.
   * @param baseProfileName Profile to restore after the jump sequence ends.
   * @param baseSize Normal hitbox size used for windup interpolation.
   * @param minSize Hitbox size while airborne.
   * @param landSize Peak hitbox size on impact.
   * @param jumpRange Distance to target that triggers the jump.
   * @param aoeDamage Damage dealt on landing.
   * @param aoeRadius Splash radius for landing damage.
   */
  constructor(
    priority: number,
    baseProfileName: string,
    baseSize: number,
    minSize: number,
    landSize: number,
    jumpRange: number,
    aoeDamage: number,
    aoeRadius: number,
  ) {
    super(priority, ["move", "attack"]);
    this.baseProfileName = baseProfileName;
    this.baseSize = baseSize;
    this.minSize = minSize;
    this.landSize = landSize;
    this.jumpRange = jumpRange;
    this.aoeDamage = aoeDamage;
    this.aoeRadius = aoeRadius;
  }

  override canStart(ctx: GoalContext<TSelf>): boolean {
    if (this.phase !== null) {
      return false;
    }
    if (ctx.world.tick < this.cooldownEndTick) {
      return false;
    }
    return this.resolveTargetInRange(ctx) !== null;
  }

  override start(ctx: GoalContext<TSelf>): void {
    this.phase = "windup";
    this.phaseTick = 0;
    ctx.self.setMovementVelocity(0, 0);
    ctx.self.setHitboxProfile(this.baseProfileName);
    const target = this.resolveTargetInRange(ctx);
    this.jumpTargetX = target?.x ?? ctx.self.x;
    this.jumpTargetY = target?.y ?? ctx.self.y;
  }

  override tick(ctx: GoalContext<TSelf>): void {
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

  override shouldContinue(_ctx: GoalContext<TSelf>): boolean {
    return this.phase !== null;
  }

  override stop(ctx: GoalContext<TSelf>): void {
    this.phase = null;
    this.phaseTick = 0;
    ctx.self.setHitboxProfile(this.baseProfileName);
    ctx.self.setMovementVelocity(0, 0);
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

    if (remaining <= 1 || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) {
      ctx.self.x = this.jumpTargetX;
      ctx.self.y = this.jumpTargetY;
      ctx.self.setMovementVelocity(0, 0);
    } else {
      ctx.self.setMovementVelocity(dx / remaining, dy / remaining);
    }

    if (this.phaseTick >= AIRBORNE_TICKS - 1) {
      this.phase = "land";
      this.phaseTick = -1;
    }
  }

  private tickLand(ctx: GoalContext<TSelf>): void {
    if (this.phaseTick === 0) {
      ctx.self.setMovementVelocity(0, 0);
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
    const aoeRadiusSq = this.aoeRadius * this.aoeRadius;
    const damageEffect = new DamageEffect(this.aoeDamage);
    const knockbackEffect = new KnockbackEffect(25);
    const candidatePlayers = ctx.world.spatial.queryBox(
      ctx.self.x - this.aoeRadius,
      ctx.self.y - this.aoeRadius,
      ctx.self.x + this.aoeRadius,
      ctx.self.y + this.aoeRadius,
    );

    for (const player of candidatePlayers) {
      if (!(player instanceof Player)) {
        continue;
      }
      if (!player.alive) {
        continue;
      }
      const dx = player.x - ctx.self.x;
      const dy = player.y - ctx.self.y;
      if (dx * dx + dy * dy <= aoeRadiusSq) {
        damageEffect.apply(ctx.world, ctx.self, player);
        knockbackEffect.apply(ctx.world, ctx.self, player);
      }
    }
  }

  private setAnimatedSquareHitbox(ctx: GoalContext<TSelf>, size: number): void {
    ctx.self.setHitboxProfileRects(ANIMATION_PROFILE_NAME, [
      makeHitboxRect(size, size),
    ]);
    ctx.self.setHitboxProfile(ANIMATION_PROFILE_NAME);
  }

  private resolveTarget(ctx: GoalContext<TSelf>): Player | null {
    const { targetId } = ctx.self;
    if (targetId === undefined) {
      return null;
    }
    const target = ctx.world.get(targetId);
    if (!(target instanceof Player) || !target.alive) {
      return null;
    }
    return target;
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
