import { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import type { Goal } from "@server/goals/Goal.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import type { EnemySnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

export type EnemyConfig = {
  moveSpeed?: number;
  radius: number;
  maxHp: number;
  // Initial per-tick movement deltas.
  vx: number;
  vy: number;
  weapons?: Weapon[];
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
    this.weapons = [...(config.weapons ?? [])];
    this.registerGoals(config.goals ?? []);
    this.collisionMode = "dynamic";
    this.radius = config.radius;
    this.setMovementVelocity(config.vx, config.vy);
  }

  public override toSnapshot(): EnemySnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "enemy",
      targetId: this.targetId,
    };
  }

  public override handleDeath(world: World): void {
    this.alive = false;
    world.despawn(this.id);
  }
}
