import { Entity } from "@server/entities/Entity.ts";
import { GoalContext } from "@server/goals/GoalContext.ts";
import type { Goal } from "@server/goals/Goal.ts";
import { GoalSelector } from "@server/goals/GoalSelector.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Shared base for entities that participate in goal-driven movement or combat.
 */
export abstract class GoalControlledEntity extends Entity {
  public goalSelector: GoalSelector<this>;
  public weapons: Weapon[] = [];
  public targetId?: number;
  public aggroRange: number;
  public arrivalRadius: number;
  public moveSpeed: number;

  protected constructor(
    id: number,
    typeId: ResourceId,
    config: {
      moveSpeed?: number;
      aggroRange?: number;
      arrivalRadius?: number;
    } = {},
  ) {
    super(id, typeId);
    this.goalSelector = new GoalSelector<this>();
    this.moveSpeed = config.moveSpeed ?? 0;
    this.aggroRange = config.aggroRange ?? 0;
    this.arrivalRadius = config.arrivalRadius ?? 0;
  }

  public override tick(world: World): void {
    this.goalSelector.tick(new GoalContext(world, this));
    for (const weapon of this.weapons) {
      weapon.tick(world);
    }
    super.tick(world);
  }

  public clearGoals(world: World): void {
    this.goalSelector.clear(new GoalContext(world, this));
  }

  protected registerGoals(goals: readonly Goal<this>[]): void {
    for (const goal of goals) {
      this.goalSelector.add(goal);
    }
  }
}
