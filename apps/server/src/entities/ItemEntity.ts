import { Entity } from "@server/entities/Entity.ts";
import { requireHitboxEntityBaselineContent } from "@server/entities/entityBaselineContent.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { PickupSnapshot } from "@shared/net/snapshots.ts";

export class ItemEntity extends Entity {
  public static readonly kind = "pickup" as const;
  public static override readonly resourceName = "item_entity";
  public contents: Inventory;

  constructor(id: number, inventory = new Inventory()) {
    const content = requireHitboxEntityBaselineContent(ItemEntity.typeId);
    super(id, { maxHp: content.maxHp });
    this.contents = inventory;
    this.collisionMode = content.collisionMode;
    this.setHitboxProfiles(
      content.hitboxProfiles,
      content.activeHitboxProfile ?? "default",
    );
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
