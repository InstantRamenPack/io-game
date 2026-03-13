import { Entity } from "@server/entities/Entity.ts";
import { GoalSelector } from "@server/goals/GoalSelector.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import type { World } from "@server/world/World.ts";

/**
 * Hostile entity with goal-driven targeting and movement state.
 */
export class Enemy extends Entity {
  goalSelector: GoalSelector;
  moveSpeed = 110;
  aggroRange = 480;
  arrivalRadius = 20;
  targetId?: number;

  /**
   * Creates an enemy with collision, hp, and its default goal stack.
   * @param id Stable runtime entity id.
   */
  constructor(id: number) {
    super(id, "enemy");
    this.collisionMode = "dynamic";
    this.radius = 16;
    this.hp = 100;
    this.maxHp = 100;
    this.vx = 0;
    this.vy = 0;
    this.goalSelector = new GoalSelector();
    this.goalSelector.add(new TargetEntityGoal(0));
    this.goalSelector.add(new GoToTargetGoal(1, this.arrivalRadius));
  }

  /**
   * Enemy behavior is driven by GoalSystem in this pass.
   * @param _world World being simulated.
   * @param _deltaMs Tick delta in milliseconds.
   */
  override tick(_world: World, _deltaMs: number): void {
    // GoalSystem owns enemy AI updates.
  }
}
