import { deriveTypeIdFromStaticMetadata } from "@server/registry/typeMetadata.ts";
import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export class Item {
  public static readonly kind = "item" as const;
  public static readonly resourceName: string = "";

  public static get typeId(): ResourceId {
    return deriveTypeIdFromStaticMetadata(this);
  }

  public readonly typeId: ResourceId;
  public ownerId?: number;

  constructor() {
    this.typeId = (this.constructor as typeof Item).typeId;
  }

  /** Override in subclasses that need per-tick behavior. */
  public tick(_world: World): void {}
}
