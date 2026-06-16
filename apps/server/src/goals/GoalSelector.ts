import type { GoalActor } from "@server/goals/GoalActor.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import type { Goal, GoalControl } from "@server/goals/Goal.ts";

/**
 * Selects and runs the best compatible goal set for one goal-controlled entity each tick.
 */
export class GoalSelector<TSelf extends GoalActor = GoalActor> {
  private readonly goals: Goal<TSelf>[] = [];
  private readonly active = new Set<Goal<TSelf>>();
  private readonly desired = new Set<Goal<TSelf>>();
  private readonly controlMaskByGoal = new Map<Goal<TSelf>, number>();

  /**
   * Registers a new goal and keeps the selector sorted by priority.
   * @param goal Goal to add.
   */
  public add(goal: Goal<TSelf>): void {
    this.goals.push(goal);
    this.goals.sort(
      (leftGoal, rightGoal) => leftGoal.priority - rightGoal.priority,
    );
    this.controlMaskByGoal.set(goal, this.resolveControlMask(goal.controls));
  }

  /**
   * Stops and removes all active goals.
   * @param ctx Runtime goal context for the acting entity.
   */
  public clear(ctx: GoalContext<TSelf>): void {
    for (const goal of this.active) {
      goal.stop(ctx);
    }
    this.active.clear();
    this.desired.clear();
  }

  /**
   * Chooses the desired active goal set, starts/stops deltas, then ticks actives.
   * @param ctx Runtime goal context for the acting entity.
   */
  public tick(ctx: GoalContext<TSelf>): void {
    this.desired.clear();
    let claimedControlsMask = 0;

    for (const goal of this.goals) {
      const controlMask = this.controlMaskByGoal.get(goal) ?? 0;
      if ((claimedControlsMask & controlMask) !== 0) {
        continue;
      }

      const eligible = this.active.has(goal)
        ? goal.shouldContinue(ctx)
        : goal.canStart(ctx);
      if (!eligible) {
        continue;
      }

      this.desired.add(goal);
      claimedControlsMask |= controlMask;
    }

    for (const goal of this.goals) {
      if (this.active.has(goal) && !this.desired.has(goal)) {
        goal.stop(ctx);
      }
    }

    for (const goal of this.goals) {
      if (this.desired.has(goal) && !this.active.has(goal)) {
        goal.start(ctx);
      }
    }

    this.active.clear();
    for (const goal of this.desired) {
      this.active.add(goal);
    }

    for (const goal of this.goals) {
      if (this.active.has(goal)) {
        goal.tick(ctx);
      }
    }
  }
  public hasActiveControl(control: GoalControl): boolean {
    const requestedControlMask = GOAL_CONTROL_MASK[control];
    for (const goal of this.active) {
      const goalControlMask = this.controlMaskByGoal.get(goal) ?? 0;
      if ((goalControlMask & requestedControlMask) !== 0) {
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
