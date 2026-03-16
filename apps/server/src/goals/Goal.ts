import type { GoalContext } from "@server/goals/GoalContext.ts";

export type GoalControl = "move" | "look" | "attack" | "target";

/**
 * Base lifecycle contract for server-authoritative enemy AI goals.
 * Lower numeric priorities win when multiple goals compete for the same control.
 */
export abstract class Goal {
  readonly priority: number;
  readonly controls: readonly GoalControl[];

  /**
   * Creates a new goal with a deterministic priority and control claim set.
   * @param priority Lower values run first.
   * @param controls Control channels this goal needs while active.
   */
  protected constructor(priority: number, controls: readonly GoalControl[]) {
    this.priority = priority;
    this.controls = controls;
  }

  /**
   * Returns whether the goal can begin from an inactive state.
   * @param ctx Runtime goal context for the acting enemy.
   */
  abstract canStart(ctx: GoalContext): boolean;

  /**
   * Performs one-time initialization when the goal becomes active.
   * @param ctx Runtime goal context for the acting enemy.
   */
  abstract start(ctx: GoalContext): void;

  /**
   * Runs the active goal for one server tick.
   * @param ctx Runtime goal context for the acting enemy.
   */
  abstract tick(ctx: GoalContext): void;

  /**
   * Returns whether the goal should remain active on this tick.
   * @param ctx Runtime goal context for the acting enemy.
   */
  abstract shouldContinue(ctx: GoalContext): boolean;

  /**
   * Performs cleanup when the goal is deactivated.
   * @param ctx Runtime goal context for the acting enemy.
   */
  abstract stop(ctx: GoalContext): void;
}
