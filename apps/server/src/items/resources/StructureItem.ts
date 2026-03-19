import { ResourceItem } from "@server/items/resources/ResourceItem.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Shared base for inventory items that correspond to placeable structure types.
 */
export abstract class StructureItem extends ResourceItem {
  public readonly buildingTypeId: ResourceId;

  protected constructor(
    id: number,
    typeId: ResourceId,
    buildingTypeId: ResourceId,
  ) {
    super(id, typeId);
    this.buildingTypeId = buildingTypeId;
  }
}
