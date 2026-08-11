import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import type { Goal, GoalControl } from "@server/goals/Goal.ts";

/**
 * Selects and runs the best compatible goal set for one goal-controlled entity each tick.
 */
export class GoalSelector<TSelf extends GoalActor = GoalActor> {
  private readonly goals: Array<{
    goal: Goal<TSelf>;
    controlMask: number;
    active: boolean;
    desired: boolean;
  }> = [];

  /**
   * Registers a new goal and keeps the selector sorted by priority.
   * @param goal Goal to add.
   */
  public add(goal: Goal<TSelf>): void {
    this.goals.push({
      goal,
      controlMask: this.resolveControlMask(goal.controls),
      active: false,
      desired: false,
    });
    this.goals.sort((left, right) => left.goal.priority - right.goal.priority);
  }

  /**
   * Stops and removes all active goals.
   * @param ctx Runtime goal context for the acting entity.
   */
  public clear(ctx: GoalContext<TSelf>): void {
    for (const scheduled of this.goals) {
      if (scheduled.active) {
        scheduled.goal.stop(ctx);
      }
      scheduled.active = false;
      scheduled.desired = false;
    }
  }

  /**
   * Chooses the desired active goal set, starts/stops deltas, then ticks actives.
   * @param ctx Runtime goal context for the acting entity.
   */
  public tick(ctx: GoalContext<TSelf>): void {
    let claimedControlsMask = 0;

    for (const scheduled of this.goals) {
      scheduled.desired = false;
      if ((claimedControlsMask & scheduled.controlMask) !== 0) {
        continue;
      }

      const eligible = scheduled.active
        ? scheduled.goal.shouldContinue(ctx)
        : scheduled.goal.canStart(ctx);
      if (!eligible) {
        continue;
      }

      scheduled.desired = true;
      claimedControlsMask |= scheduled.controlMask;
    }

    for (const scheduled of this.goals) {
      if (scheduled.active && !scheduled.desired) {
        scheduled.goal.stop(ctx);
      }
    }

    for (const scheduled of this.goals) {
      if (scheduled.desired && !scheduled.active) {
        scheduled.goal.start(ctx);
      }
    }

    for (const scheduled of this.goals) {
      scheduled.active = scheduled.desired;
      if (scheduled.active) {
        scheduled.goal.tick(ctx);
      }
    }
  }
  public hasActiveControl(control: GoalControl): boolean {
    const requestedControlMask = GOAL_CONTROL_MASK[control];
    for (const scheduled of this.goals) {
      if (
        scheduled.active &&
        (scheduled.controlMask & requestedControlMask) !== 0
      ) {
        return true;
      }
    }
    return false;
  }

  private resolveControlMask(
    requestedControls: readonly GoalControl[],
  ): number {
    let controlMask = 0;
    for (const requestedControl of requestedControls) {
      controlMask |= GOAL_CONTROL_MASK[requestedControl];
    }
    return controlMask;
  }
}

const GOAL_CONTROL_MASK: Record<GoalControl, number> = {
  move: 1,
  look: 2,
  attack: 4,
  target: 8,
};
