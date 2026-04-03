import { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import type { HitboxProfiles } from "@server/entities/CompositeHitbox.ts";
import type { Goal } from "@server/goals/Goal.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import type { EnemySnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

export type EnemyConfig = {
  moveSpeed?: number;
  hitboxProfiles: HitboxProfiles;
  activeHitboxProfile?: string;
  maxHp: number;
  weapons?: Weapon[];
  goals?: readonly Goal<Enemy>[];
};

/**
 * Hostile entity with goal-driven targeting and movement state.
 */
export class Enemy extends GoalControlledEntity {
  public static readonly kind = "enemy" as const;

  /**
   * Creates a hostile entity with caller-provided combat and movement defaults.
   * @param id Stable runtime entity id.
   * @param config Enemy tuning and goal stack.
   */
  constructor(id: number, config: EnemyConfig) {
    super(id, config);
    this.weapons = [...(config.weapons ?? [])];
    this.registerGoals(config.goals ?? []);
    this.collisionMode = "dynamic";
    this.setHitboxProfiles(
      config.hitboxProfiles,
      config.activeHitboxProfile ?? "default",
    );
  }

  public override toSnapshot(): EnemySnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "enemy",
      targetId: this.targetId,
    };
  }

  public override hasInfiniteReloadMags(): boolean {
    return true;
  }

  public override handleDeath(world: World): void {
    this.alive = false;
    world.despawn(this.id);
  }
}
