import { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import { requireHitboxEntityBaselineContent } from "@server/entities/entityBaselineContent.ts";
import type { StructureSnapshot } from "@shared/net/snapshots.ts";

/**
 * Shared static world-structure base for map-generated collision geometry.
 */
export class Structure extends GoalControlledEntity {
  public static readonly kind = "structure" as const;
  public label: string;

  constructor(id: number) {
    const content = requireHitboxEntityBaselineContent(
      (new.target as typeof Structure).typeId,
    );
    super(id, { maxHp: content.maxHp });
    this.label = content.label;
    this.collisionMode = content.collisionMode;
    this.setHitboxProfiles(
      content.hitboxProfiles,
      content.activeHitboxProfile ?? "default",
    );
  }

  public override toSnapshot(): StructureSnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "structure",
      label: this.label,
    };
  }

  public override handleDeath(): void {
    // Structures are immutable world geometry for now; death is intentionally a no-op.
  }
}
