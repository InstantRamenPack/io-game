import { Entity } from "@server/entities/Entity.ts";
import type { Goal } from "@server/goals/Goal.ts";
import { GoalSelector } from "@server/goals/GoalSelector.ts";
import type { MeleeWeapon } from "@server/items/MeleeWeapon.ts";
import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type EnemyConfig = {
  radius: number;
  hp: number;
  maxHp: number;
  // Initial per-tick movement deltas.
  vx: number;
  vy: number;
  // Distance moved per simulation tick while steering.
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
  /** Distance moved per simulation tick while steering. */
  moveSpeed: number;
  aggroRange: number;
  arrivalRadius: number;
  targetId?: number;
  meleeWeapon?: MeleeWeapon;

  /**
   * Creates a hostile entity with caller-provided combat and movement defaults.
   * @param id Stable runtime entity id.
   * @param typeId Concrete enemy type id.
   * @param config Enemy tuning and goal stack.
   */
  constructor(id: number, typeId: ResourceId, config: EnemyConfig) {
    super(id, typeId);
    this.collisionMode = "dynamic";
    this.radius = config.radius;
    this.hp = config.hp;
    this.maxHp = config.maxHp;
    this.setMovementVelocity(config.vx, config.vy);
    this.moveSpeed = config.moveSpeed ?? 8;
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
    super.tick(_world);
    this.meleeWeapon?.tick(_world);
  }
}
