import { ResourceItem } from "@server/items/resources/ResourceItem.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

/**
 * Shared base for inventory items that correspond to placeable structure types.
 */
export abstract class StructureItem extends ResourceItem {
  public static override readonly stackMax: number = 99;
  public static readonly buildingTypeId: ResourceId | undefined = undefined;
  public readonly buildingTypeId: ResourceId;

  protected constructor(id: number) {
    super(id);
    const StaticCtor = this.constructor as typeof StructureItem & {
      readonly buildingTypeId: ResourceId;
    };
    this.buildingTypeId = StaticCtor.buildingTypeId;
  }
}
