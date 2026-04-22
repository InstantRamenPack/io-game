import { Entity } from "@server/entities/Entity.ts";
import { requireHitboxEntityBaselineContent } from "@server/entities/entityBaselineContent.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
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

  public getSingleStackable(): {
    typeId: ResourceId;
    amount: number;
  } | null {
    let typeId: ResourceId | undefined;
    let amount = 0;

    for (const [resourceTypeId, resourceAmount] of this.contents.resources) {
      if (resourceAmount <= 0) {
        continue;
      }
      if (typeId && typeId !== resourceTypeId) {
        return null;
      }
      typeId = resourceTypeId;
      amount += resourceAmount;
    }

    for (const slot of this.contents.hotbarSlots) {
      if (!slot) {
        continue;
      }
      if (slot.kind === "weapon") {
        return null;
      }
      if (slot.count <= 0) {
        continue;
      }
      if (typeId && typeId !== slot.typeId) {
        return null;
      }
      typeId = slot.typeId;
      amount += slot.count;
    }

    if (!typeId || amount <= 0) {
      return null;
    }

    return { typeId, amount };
  }

  public canMergeStackableWith(other: ItemEntity): boolean {
    const leftStack = this.getSingleStackable();
    const rightStack = other.getSingleStackable();
    if (!leftStack || !rightStack) {
      return false;
    }
    return leftStack.typeId === rightStack.typeId;
  }

  public mergeStackableFrom(other: ItemEntity): boolean {
    const leftStack = this.getSingleStackable();
    const rightStack = other.getSingleStackable();
    if (!leftStack || !rightStack || leftStack.typeId !== rightStack.typeId) {
      return false;
    }

    return this.contents.addStackable(leftStack.typeId, rightStack.amount);
  }
}
