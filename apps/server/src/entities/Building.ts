import { Entity } from "@server/entities/Entity.ts";

export type BuildingType = "wall" | "tower" | "windmill" | "crafting_station";

/**
 * Static structure replicated to clients for simple base-building visuals.
 */
export class Building extends Entity {
  readonly buildingType: BuildingType;
  readonly label: string;
  tier: number;

  constructor(
    id: number,
    buildingType: BuildingType,
    label: string,
    tier = 1,
    ownerId?: number,
  ) {
    super(id, "building");
    this.buildingType = buildingType;
    this.label = label;
    this.tier = tier;
    this.ownerId = ownerId;
    this.collisionMode = "static";
    this.maxHp = this.resolveMaxHp(buildingType, tier);
    this.hp = this.maxHp;
    this.radius = this.resolveRadius(buildingType);
  }

  override toSnapshot(): import("@shared/net/snapshots.ts").EntitySnapshot {
    const snapshot = super.toSnapshot();
    snapshot.name = this.label;
    snapshot.data = {
      buildingType: this.buildingType,
      label: this.label,
      tier: this.tier,
    };
    return snapshot;
  }

  private resolveRadius(buildingType: BuildingType): number {
    if (buildingType === "wall") {
      return 20;
    }
    if (buildingType === "tower") {
      return 24;
    }
    if (buildingType === "windmill") {
      return 28;
    }
    return 26;
  }

  private resolveMaxHp(buildingType: BuildingType, tier: number): number {
    const tierScale = Math.max(1, tier);
    if (buildingType === "wall") {
      return 180 * tierScale;
    }
    if (buildingType === "tower") {
      return 240 * tierScale;
    }
    if (buildingType === "windmill") {
      return 220 * tierScale;
    }
    return 260 * tierScale;
  }
}
