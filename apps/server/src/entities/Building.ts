import { Entity } from "@server/entities/Entity.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { BuildingSnapshot } from "@shared/net/snapshots.ts";

type BuildingStats = {
  baseHp: number;
  radius: number;
};

/**
 * Shared static-structure base for all concrete building entities.
 */
export abstract class Building extends Entity {
  public readonly label: string;
  public tier: number;

  protected constructor(
    id: number,
    typeId: ResourceId,
    label: string,
    tier: number,
    ownerId: number | undefined,
    stats: BuildingStats,
  ) {
    super(id, typeId);
    this.label = label;
    this.tier = Math.max(1, tier);
    this.ownerId = ownerId;
    this.collisionMode = "static";
    this.radius = stats.radius;
    this.maxHp = stats.baseHp * this.tier;
    this.hp = this.maxHp;
  }

  public override toSnapshot(): BuildingSnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "building",
      hp: this.hp ?? this.maxHp ?? 0,
      maxHp: this.maxHp ?? 0,
      label: this.label,
      tier: this.tier,
    };
  }
}
