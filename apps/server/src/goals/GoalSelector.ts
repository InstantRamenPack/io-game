import type { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import type { Goal, GoalControl } from "@server/goals/Goal.ts";

/**
 * Selects and runs the best compatible goal set for one goal-controlled entity each tick.
 */
export class GoalSelector<
  TSelf extends GoalControlledEntity = GoalControlledEntity,
> {
  private readonly goals: Goal<TSelf>[] = [];
  private readonly active = new Set<Goal<TSelf>>();

  /**
   * Registers a new goal and keeps the selector sorted by priority.
   * @param goal Goal to add.
   */
  add(goal: Goal<TSelf>): void {
    this.goals.push(goal);
    this.goals.sort(
      (leftGoal, rightGoal) => leftGoal.priority - rightGoal.priority,
    );
  }

  /**
   * Stops and removes all active goals.
   * @param ctx Runtime goal context for the acting entity.
   */
  clear(ctx: GoalContext<TSelf>): void {
    for (const goal of this.goals) {
      if (this.active.has(goal)) {
        goal.stop(ctx);
      }
    }
    this.active.clear();
  }

  /**
   * Chooses the desired active goal set, starts/stops deltas, then ticks actives.
   * @param ctx Runtime goal context for the acting entity.
   */
  tick(ctx: GoalContext<TSelf>): void {
    const desired = new Set<Goal<TSelf>>();
    const claimedControls = new Set<GoalControl>();

    for (const goal of this.goals) {
      const eligible = this.active.has(goal)
        ? goal.shouldContinue(ctx)
        : goal.canStart(ctx);
      if (
        !eligible ||
        this.hasControlConflict(claimedControls, goal.controls)
      ) {
        continue;
      }
      desired.add(goal);
      this.claimControls(claimedControls, goal.controls);
    }

    for (const goal of this.goals) {
      if (this.active.has(goal) && !desired.has(goal)) {
        goal.stop(ctx);
      }
    }

    for (const goal of this.goals) {
      if (desired.has(goal) && !this.active.has(goal)) {
        goal.start(ctx);
      }
    }

    this.active.clear();
    for (const goal of desired) {
      this.active.add(goal);
    }

    for (const goal of this.goals) {
      if (this.active.has(goal)) {
        goal.tick(ctx);
      }
    }
  }

  /**
   * Returns the class names of the currently active goals.
   */
  debugActive(): string[] {
    return this.goals
      .filter((goal) => this.active.has(goal))
      .map((goal) => goal.constructor.name);
  }

  hasActiveControl(control: GoalControl): boolean {
    for (const goal of this.active) {
      if (goal.controls.includes(control)) {
        return true;
      }
    }
    return false;
  }

  private hasControlConflict(
    claimedControls: ReadonlySet<GoalControl>,
    requestedControls: readonly GoalControl[],
  ): boolean {
    for (const requestedControl of requestedControls) {
      if (claimedControls.has(requestedControl)) {
        return true;
      }
    }
    return false;
  }

  private claimControls(
    claimedControls: Set<GoalControl>,
    requestedControls: readonly GoalControl[],
  ): void {
    for (const requestedControl of requestedControls) {
      claimedControls.add(requestedControl);
    }
  }
}
