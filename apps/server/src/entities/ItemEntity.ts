import { Entity } from "@server/entities/Entity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { PickupSnapshot } from "@shared/net/snapshots.ts";

export class ItemEntity extends Entity {
  public static readonly kind = "pickup" as const;
  public static override readonly resourceName = "item_entity";

  public constructor(id: number, inventory = new Inventory()) {
    super(id, inventory);
    this.radius = 14;
  }

  public override toSnapshot(): PickupSnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "pickup",
      inventory: this.inventory?.toSnapshot() ?? {
        stackables: [],
        weapons: [],
        activeWeaponIndex: null,
      },
    };
  }
}
