import {
  CraftingStation,
  Tower,
  Wall,
  Windmill,
} from "@server/entities/Building.ts";
import { ResourceItem } from "@server/items/resources/ResourceItem.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Shared base for inventory items that correspond to placeable structure types.
 */
export abstract class StructureItem extends ResourceItem {
  readonly buildingTypeId: ResourceId;

  protected constructor(
    id: number,
    typeId: ResourceId,
    buildingTypeId: ResourceId,
  ) {
    super(id, typeId);
    this.buildingTypeId = buildingTypeId;
    this.data = {
      buildingTypeId,
    };
  }
}

export class WallItem extends StructureItem {
  static readonly typeId = "item:wall" as const;

  constructor(id: number) {
    super(id, WallItem.typeId, Wall.typeId);
  }
}

export class TowerItem extends StructureItem {
  static readonly typeId = "item:tower" as const;

  constructor(id: number) {
    super(id, TowerItem.typeId, Tower.typeId);
  }
}

export class WindmillItem extends StructureItem {
  static readonly typeId = "item:windmill" as const;

  constructor(id: number) {
    super(id, WindmillItem.typeId, Windmill.typeId);
  }
}

export class CraftingStationItem extends StructureItem {
  static readonly typeId = "item:crafting_station" as const;

  constructor(id: number) {
    super(id, CraftingStationItem.typeId, CraftingStation.typeId);
  }
}
