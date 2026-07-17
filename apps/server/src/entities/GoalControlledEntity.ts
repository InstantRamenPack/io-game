import { Entity } from "@server/entities/Entity.ts";
import type { GoalActor } from "@server/goals/GoalActor.ts";
import { GoalContext } from "@server/goals/GoalContext.ts";
import type { Goal } from "@server/goals/Goal.ts";
import { GoalSelector } from "@server/goals/GoalSelector.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import type { World } from "@server/world/World.ts";

/**
 * Shared base for entities that participate in goal-driven movement or combat.
 */
export abstract class GoalControlledEntity extends Entity implements GoalActor {
  public goalSelector: GoalSelector<this>;
  public weapons: Weapon[] = [];
  public targetId?: number;
  public moveSpeed: number;
  protected goalTickInterval = 1;
  private readonly goalContext = new GoalContext<this>();

  protected constructor(
    id: number,
    config: {
      maxHp?: number;
      moveSpeed?: number;
    } = {},
  ) {
    super(id, { maxHp: config.maxHp });
    this.goalSelector = new GoalSelector<this>();
    this.moveSpeed = config.moveSpeed ?? 0;
    if (this.moveSpeed > 0) {
      this.setMovementTuning({
        driveAccelerationPerTick: Math.max(3, this.moveSpeed * 0.45),
      });
    }
  }

  public override tick(world: World): void {
    super.tick(world);
    if (!this.alive || !world.entities.has(this.id)) {
      return;
    }
    if (this.isStunned()) {
      this.steerTowardVelocity(0, 0, Number.POSITIVE_INFINITY);
      return;
    }

    for (const weapon of this.weapons) {
      weapon.ownerId = this.id;
      weapon.tick(world);
    }

    if (!world.shouldRunEntityGoalsAndCollisions(this)) {
      return;
    }
    if (!this.shouldTickGoals(world)) {
      return;
    }

    this.goalSelector.tick(this.goalContext.reset(world, this));
  }

  protected registerGoals(goals: readonly Goal<this>[]): void {
    for (const goal of goals) {
      this.goalSelector.add(goal);
    }
  }

  protected getGoalTickInterval(_world: World): number {
    return this.goalTickInterval;
  }

  private shouldTickGoals(world: World): boolean {
    const interval = this.getGoalTickInterval(world);
    return interval <= 1 || (world.tick + this.id) % interval === 0;
  }
}
