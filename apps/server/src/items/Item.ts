import { deriveTypeIdFromStaticMetadata } from "@server/registry/typeMetadata.ts";
import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export class Item {
  public static readonly kind = "item" as const;
  public static readonly resourceName: string = "";
  public static readonly stackMax: number = 1;

  public static get typeId(): ResourceId {
    return deriveTypeIdFromStaticMetadata(this);
  }

  public readonly typeId: ResourceId;
  public ownerId?: number;

  public constructor() {
    this.typeId = (this.constructor as typeof Item).typeId;
  }

  /** Per-tick extension point for subclass-specific behavior. */
  public tick(_world: World): void {
    // placeholder; per-entity logic hooks can be added later
  }
}
