import { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import { requireHitboxEntityBaselineContent } from "@server/entities/entityBaselineContent.ts";
import type { Goal } from "@server/goals/Goal.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import type { EnemySnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

type EnemyConfig = {
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
    const content = requireHitboxEntityBaselineContent(
      (new.target as typeof Enemy).typeId,
    );
    super(id, { maxHp: content.maxHp, moveSpeed: content.moveSpeed });
    this.weapons = [...(config.weapons ?? [])];
    this.registerGoals(config.goals ?? []);
    this.collisionMode = content.collisionMode;
    this.setHitboxProfiles(
      content.hitboxProfiles,
      content.activeHitboxProfile ?? "default",
    );
  }

  public override toSnapshot(): EnemySnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "enemy",
      targetId: this.targetId,
      equippedItem: this.weapons[0]?.toEquippedItemSnapshot(this),
    };
  }

  public override hasInfiniteReloadMags(): boolean {
    return true;
  }

  public override handleDeath(world: World): void {
    this.alive = false;
    world.despawn(this.id);
  }

  protected override getGoalTickInterval(world: World): number {
    if (world.enemyCount >= 300) {
      return 8;
    }
    if (world.enemyCount >= 150) {
      return 4;
    }
    if (world.enemyCount >= 60) {
      return 2;
    }
    return 1;
  }
}
