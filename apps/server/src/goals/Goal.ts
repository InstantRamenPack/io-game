import type { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";

export type GoalControl = "move" | "look" | "attack" | "target";

/**
 * Base lifecycle contract for server-authoritative goal-controlled behavior.
 * Lower numeric priorities win when multiple goals compete for the same control.
 */
export abstract class Goal<
  TSelf extends GoalControlledEntity = GoalControlledEntity,
> {
  public readonly priority: number;
  public readonly controls: readonly GoalControl[];

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
   * @param ctx Runtime goal context for the acting goal-controlled entity.
   */
  public abstract canStart(ctx: GoalContext<TSelf>): boolean;

  /**
   * Performs one-time initialization when the goal becomes active.
   * @param ctx Runtime goal context for the acting goal-controlled entity.
   */
  public abstract start(ctx: GoalContext<TSelf>): void;

  /**
   * Runs the active goal for one server tick.
   * @param ctx Runtime goal context for the acting goal-controlled entity.
   */
  public abstract tick(ctx: GoalContext<TSelf>): void;

  /**
   * Returns whether the goal should remain active on this tick.
   * @param ctx Runtime goal context for the acting goal-controlled entity.
   */
  public abstract shouldContinue(ctx: GoalContext<TSelf>): boolean;

  /**
   * Performs cleanup when the goal is deactivated.
   * @param ctx Runtime goal context for the acting goal-controlled entity.
   */
  public abstract stop(ctx: GoalContext<TSelf>): void;
}
