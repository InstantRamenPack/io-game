import { Entity } from "@server/entities/Entity.ts";
import { GoalContext } from "@server/goals/GoalContext.ts";
import type { Goal } from "@server/goals/Goal.ts";
import { GoalSelector } from "@server/goals/GoalSelector.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { EnemySnapshot } from "@shared/net/snapshots.ts";

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
  public goalSelector: GoalSelector;
  /** Distance moved per simulation tick while steering. */
  public moveSpeed: number;
  public aggroRange: number;
  public arrivalRadius: number;
  public targetId?: number;
  public weapons: Weapon[] = [];

  /**
   * Creates a hostile entity with caller-provided combat and movement defaults.
   * @param id Stable runtime entity id.
   * @param typeId Concrete enemy type id.
   * @param config Enemy tuning and goal stack.
   */
  public constructor(id: number, typeId: ResourceId, config: EnemyConfig) {
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
   * @param world World being simulated.
   */
  public override tick(world: World): void {
    this.goalSelector.tick(new GoalContext(world, this));
    for (const weapon of this.weapons) {
      weapon.tick(world);
    }
    super.tick(world);
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
