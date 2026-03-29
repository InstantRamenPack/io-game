import { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import type { HitboxProfiles } from "@server/entities/CompositeHitbox.ts";
import type { BuildingSnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

type BuildingStats = {
  baseHp: number;
  hitboxProfiles: HitboxProfiles;
  activeHitboxProfile?: string;
};

/**
 * Shared static-structure base for all concrete building entities.
 */
export class Building extends GoalControlledEntity {
  public static readonly kind = "building" as const;
  public readonly label: string;
  public tier: number;

  public constructor(
    id: number,
    label: string,
    tier: number,
    ownerId: number | undefined,
    stats: BuildingStats,
  ) {
    const resolvedTier = Math.max(1, tier);
    super(id, { maxHp: stats.baseHp * resolvedTier });
    this.label = label;
    this.tier = resolvedTier;
    this.ownerId = ownerId;
    this.collisionMode = "static";
    this.setHitboxProfiles(
      stats.hitboxProfiles,
      stats.activeHitboxProfile ?? "default",
    );
  }

  public override toSnapshot(): BuildingSnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "building",
      label: this.label,
      tier: this.tier,
    };
  }

  public override handleDeath(world: World): void {
    this.alive = false;
    world.despawn(this.id);
  }
}
