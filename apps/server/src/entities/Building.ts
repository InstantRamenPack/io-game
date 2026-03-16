import { Entity } from "@server/entities/Entity.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

type BuildingStats = {
  baseHp: number;
  radius: number;
};

type BuildingSnapshotData = {
  tier: number;
};

/**
 * Shared static-structure base for all concrete building entities.
 */
export abstract class Building extends Entity {
  readonly label: string;
  tier: number;

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

  override toSnapshot(): import("@shared/net/snapshots.ts").EntitySnapshot {
    const snapshot = super.toSnapshot();
    const data: BuildingSnapshotData = {
      tier: this.tier,
    };
    snapshot.name = this.label;
    snapshot.data = data;
    return snapshot;
  }
}

export class Wall extends Building {
  static readonly typeId = "building:wall" as const;

  constructor(id: number, label = "Wall", tier = 1, ownerId?: number) {
    super(id, Wall.typeId, label, tier, ownerId, {
      baseHp: 180,
      radius: 20,
    });
  }
}

export class Tower extends Building {
  static readonly typeId = "building:tower" as const;

  constructor(id: number, label = "Tower", tier = 1, ownerId?: number) {
    super(id, Tower.typeId, label, tier, ownerId, {
      baseHp: 240,
      radius: 24,
    });
  }
}

export class Windmill extends Building {
  static readonly typeId = "building:windmill" as const;

  constructor(id: number, label = "Windmill", tier = 1, ownerId?: number) {
    super(id, Windmill.typeId, label, tier, ownerId, {
      baseHp: 220,
      radius: 28,
    });
  }
}

export class CraftingStation extends Building {
  static readonly typeId = "building:crafting_station" as const;

  constructor(
    id: number,
    label = "Crafting Station",
    tier = 1,
    ownerId?: number,
  ) {
    super(id, CraftingStation.typeId, label, tier, ownerId, {
      baseHp: 260,
      radius: 26,
    });
  }
}
