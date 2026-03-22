import { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import type { Goal } from "@server/goals/Goal.ts";
import type { EnemySnapshot } from "@shared/net/snapshots.ts";

export type EnemyConfig = {
  moveSpeed?: number;
  aggroRange?: number;
  arrivalRadius?: number;
  radius: number;
  hp: number;
  maxHp: number;
  // Initial per-tick movement deltas.
  vx: number;
  vy: number;
  goals?: readonly Goal<Enemy>[];
};

/**
 * Hostile entity with goal-driven targeting and movement state.
 */
export class Enemy extends GoalControlledEntity {
  public static readonly kind = "enemy" as const;

  /**
   * Creates a hostile entity with caller-provided combat and movement defaults.
   * @param id Stable runtime entity id.
   * @param config Enemy tuning and goal stack.
   */
  public constructor(id: number, config: EnemyConfig) {
    super(id, config);
    this.registerGoals(config.goals ?? []);
    this.collisionMode = "dynamic";
    this.radius = config.radius;
    this.hp = config.hp;
    this.maxHp = config.maxHp;
    this.setMovementVelocity(config.vx, config.vy);
  }

  public override toSnapshot(): EnemySnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "enemy",
      hp: this.hp ?? 0,
      maxHp: this.maxHp ?? 0,
      targetId: this.targetId,
    };
  }
}
