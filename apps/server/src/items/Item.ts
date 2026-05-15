import type { World } from "@server/world/World.ts";
import type { Inventory } from "@server/items/Inventory.ts";
import type { ItemRequirement } from "@shared/content/schema.ts";
import { makeResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";

export class Item {
  public static readonly kind = "item" as const;
  public static readonly resourceName: string = "";

  public static get typeId(): ResourceId {
    return makeResourceId(this.kind, this.resourceName);
  }

  public readonly typeId: ResourceId;
  public ownerId?: number;

  constructor() {
    this.typeId = (this.constructor as typeof Item).typeId;
  }

  /** Override in subclasses that need per-tick behavior. */
  public tick(_world: World): void {}

  public isStoredOnInventoryAcquisition(): boolean {
    return true;
  }

  public isWeaponItem(): boolean {
    return false;
  }

  public requiresManualPickup(): boolean {
    return false;
  }

  public canGrantToInventory(
    targetInventory: Inventory,
    amount: number,
  ): boolean {
    return targetInventory.canAddStackable(this.typeId, amount);
  }

  public canGrantToInventoryAfterConsuming(
    targetInventory: Inventory,
    amount: number,
    _costs: readonly ItemRequirement[],
  ): boolean {
    return this.canGrantToInventory(targetInventory, amount);
  }

  public grantToInventory(targetInventory: Inventory, amount: number): boolean {
    if (amount <= 0) {
      return true;
    }
    if (!this.canGrantToInventory(targetInventory, amount)) {
      return false;
    }
    return targetInventory.addStackable(this.typeId, amount);
  }

  public getHotbarSlotsFreedWhenConsumed(_amount: number): number {
    return 0;
  }

  public getCraftTraceResult(): "crafted_stackable" | "crafted_weapon" {
    return "crafted_stackable";
  }
}
