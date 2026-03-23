import type { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { Goal } from "@server/goals/Goal.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";

type JumpPhase = "windup" | "airborne" | "land";

const WINDUP_TICKS = 25;
const AIRBORNE_TICKS = 15;
const LAND_TICKS = 12;
const COOLDOWN_TICKS = 80;

/**
 * Jump attack goal: winds up, leaps to target, lands with AoE damage.
 * Animates entity radius — shrinks while airborne, bursts large on impact.
 */
export class JumpAttackGoal<TSelf extends Enemy = Enemy> extends Goal<TSelf> {
  private phase: JumpPhase | null = null;
  private phaseTick = 0;
  private jumpTargetX = 0;
  private jumpTargetY = 0;
  private cooldownEndTick = 0;

  private readonly baseRadius: number;
  private readonly minRadius: number;
  private readonly landRadius: number;
  private readonly jumpRange: number;
  private readonly aoeDamage: number;
  private readonly aoeRadius: number;

  /**
   * @param priority Lower values run first.
   * @param baseRadius Normal entity radius.
   * @param minRadius Radius while airborne (compressed).
   * @param landRadius Peak radius on impact (burst).
   * @param jumpRange Distance to target that triggers the jump.
   * @param aoeDamage Damage dealt on landing.
   * @param aoeRadius Splash radius for landing damage.
   */
  constructor(
    priority: number,
    baseRadius: number,
    minRadius: number,
    landRadius: number,
    jumpRange: number,
    aoeDamage: number,
    aoeRadius: number,
  ) {
    super(priority, ["move", "attack"]);
    this.baseRadius = baseRadius;
    this.minRadius = minRadius;
    this.landRadius = landRadius;
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
    // jumpTarget will be set at the start of airborne via tracking
    this.jumpTargetX = ctx.self.x;
    this.jumpTargetY = ctx.self.y;
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
    ctx.self.radius = this.baseRadius;
    ctx.self.setMovementVelocity(0, 0);
  }

  private tickWindup(ctx: GoalContext<TSelf>): void {
    // Shrink radius from base to min as the megaknight crouches for the jump
    const t = Math.min(1, this.phaseTick / Math.max(1, WINDUP_TICKS - 1));
    ctx.self.radius = Math.round(this.lerp(this.baseRadius, this.minRadius, t));

    if (this.phaseTick >= WINDUP_TICKS - 1) {
      this.phase = "airborne";
      this.phaseTick = -1; // becomes 0 after tick() increments
    }
  }

  private tickAirborne(ctx: GoalContext<TSelf>): void {
    ctx.self.radius = this.minRadius;

    // Track the player each tick during flight so the entity always lands on them
    const currentTarget = this.resolveTarget(ctx);
    if (currentTarget) {
      this.jumpTargetX = currentTarget.x;
      this.jumpTargetY = currentTarget.y;
    }

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

    // Radius expands to landRadius then settles back to baseRadius
    const half = LAND_TICKS / 2;
    let radius: number;
    if (this.phaseTick < half) {
      radius = this.lerp(this.minRadius, this.landRadius, this.phaseTick / half);
    } else {
      radius = this.lerp(
        this.landRadius,
        this.baseRadius,
        (this.phaseTick - half) / half,
      );
    }
    ctx.self.radius = Math.round(radius);

    if (this.phaseTick >= LAND_TICKS - 1) {
      ctx.self.radius = this.baseRadius;
      this.cooldownEndTick = ctx.world.tick + COOLDOWN_TICKS;
      this.phase = null;
      this.phaseTick = -1;
    }
  }

  private applyAoeDamage(ctx: GoalContext<TSelf>): void {
    const aoeRadiusSq = this.aoeRadius * this.aoeRadius;
    const damageEffect = new DamageEffect(this.aoeDamage);
    const knockbackEffect = new KnockbackEffect(25);

    for (const player of ctx.world.entities.queryInstances(Player)) {
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
