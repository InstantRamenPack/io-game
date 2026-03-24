import { Entity } from "@server/entities/Entity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { PickupSnapshot } from "@shared/net/snapshots.ts";

export class ItemEntity extends Entity {
  public static readonly kind = "pickup" as const;
  public static override readonly resourceName = "item_entity";
  public contents: Inventory;

  public constructor(id: number, inventory = new Inventory()) {
    super(id, { maxHp: 0 });
    this.contents = inventory;
    this.radius = 14;
  }

  public override toSnapshot(): PickupSnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "pickup",
      inventory: this.contents.toSnapshot(),
    };
  }

  public override handleDeath(): void {
    // pickups are not damageable, but satisfy the shared contract
  }
}
