import { Entity } from "@server/entities/Entity.ts";
import type { Goal } from "@server/goals/Goal.ts";
import { GoalSelector } from "@server/goals/GoalSelector.ts";
import type { World } from "@server/world/World.ts";

export type EnemyConfig = {
  radius: number;
  hp: number;
  maxHp: number;
  vx: number;
  vy: number;
  moveSpeed?: number;
  aggroRange?: number;
  arrivalRadius?: number;
  goals?: readonly Goal[];
};

/**
 * Hostile entity with goal-driven targeting and movement state.
 */
export class Enemy extends Entity {
  goalSelector: GoalSelector;
  moveSpeed: number;
  aggroRange: number;
  arrivalRadius: number;
  targetId?: number;

  /**
   * Creates a hostile entity with caller-provided combat and movement defaults.
   * @param id Stable runtime entity id.
   * @param config Enemy tuning and goal stack.
   */
  constructor(id: number, config: EnemyConfig) {
    super(id, "enemy");
    this.collisionMode = "dynamic";
    this.radius = config.radius;
    this.hp = config.hp;
    this.maxHp = config.maxHp;
    this.vx = config.vx;
    this.vy = config.vy;
    this.moveSpeed = config.moveSpeed ?? 110;
    this.aggroRange = config.aggroRange ?? 480;
    this.arrivalRadius = config.arrivalRadius ?? 20;
    this.goalSelector = new GoalSelector();
    for (const goal of config.goals ?? []) {
      this.goalSelector.add(goal);
    }
  }

  /**
   * Enemy behavior is driven by GoalSystem in this pass.
   * @param _world World being simulated.
   */
  override tick(_world: World): void {
    // GoalSystem owns enemy AI updates.
  }
}
