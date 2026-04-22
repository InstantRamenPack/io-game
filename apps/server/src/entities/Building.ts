import { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import { requireHitboxEntityBaselineContent } from "@server/entities/entityBaselineContent.ts";
import type { BuildingSnapshot } from "@shared/net/snapshots.ts";
import type { World } from "@server/world/World.ts";

/**
 * Shared static-structure base for all concrete building entities.
 */
export class Building extends GoalControlledEntity {
  public static readonly kind = "building" as const;
  public label: string;
  public tier: number;

  constructor(id: number, tier: number, ownerId: number | undefined) {
    const content = requireHitboxEntityBaselineContent(
      (new.target as typeof Building).typeId,
    );
    const resolvedTier = Math.max(1, tier);
    super(id, { maxHp: content.maxHp * resolvedTier });
    this.label = content.label;
    this.tier = resolvedTier;
    this.ownerId = ownerId;
    this.collisionMode = content.collisionMode;
    this.setHitboxProfiles(
      content.hitboxProfiles,
      content.activeHitboxProfile ?? "default",
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
