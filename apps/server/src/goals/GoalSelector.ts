import type { GoalContext } from "@server/goals/GoalContext.ts";
import type { GoalControl } from "@server/goals/Goal.ts";
import { Goal } from "@server/goals/Goal.ts";

/**
 * Selects and runs the best compatible goal set for one enemy each tick.
 */
export class GoalSelector {
  private readonly goals: Goal[] = [];
  private readonly active = new Set<Goal>();

  /**
   * Registers a new goal and keeps the selector sorted by priority.
   * @param goal Goal to add.
   */
  add(goal: Goal): void {
    this.goals.push(goal);
    this.goals.sort(
      (leftGoal, rightGoal) => leftGoal.priority - rightGoal.priority,
    );
  }

  /**
   * Stops and removes all active goals.
   * @param ctx Runtime goal context for the acting enemy.
   */
  clear(ctx: GoalContext): void {
    for (const goal of this.goals) {
      if (this.active.has(goal)) {
        goal.stop(ctx);
      }
    }
    this.active.clear();
  }

  /**
   * Chooses the desired active goal set, starts/stops deltas, then ticks actives.
   * @param ctx Runtime goal context for the acting enemy.
   */
  tick(ctx: GoalContext): void {
    const desired = new Set<Goal>();
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
