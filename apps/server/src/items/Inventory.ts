import { getItemContent } from "@shared/content/catalog.ts";
import type { ItemRequirement } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type {
  InventorySlotSnapshot,
  InventorySnapshot,
} from "@shared/net/snapshots.ts";
import { HOTBAR_SLOT_COUNT } from "@shared/gameplay/constants.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { Item } from "@server/items/Item.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import {
  itemTypeRegistry,
  type RegistrableItemCtor,
} from "@server/registry/registries.ts";

type BuildableSlot = {
  kind: "buildable";
  typeId: ResourceId;
  count: number;
};

type WeaponSlot = {
  kind: "weapon";
  weapon: Weapon;
};

type InventorySlot = BuildableSlot | WeaponSlot | null;

export class Inventory {
  public resources = new Map<ResourceId, number>();
  private readonly unlockedRecipeTypeIds = new Set<ResourceId>();
  public hotbarSlots: InventorySlot[] = Array.from(
    { length: HOTBAR_SLOT_COUNT },
    () => null,
  );
  public selectedHotbarIndex = 0;
  private cachedResourceSnapshot?: InventorySnapshot["resources"];
  private cachedUnlockedRecipeSnapshot?: InventorySnapshot["unlockedRecipeTypeIds"];
  private resourcesDirty = true;
  private unlockedRecipesDirty = true;

  public addStackable(typeId: ResourceId, amount: number): boolean {
    if (amount <= 0) {
      return true;
    }

    if (!this.isBuildableType(typeId)) {
      this.setResourceCount(typeId, this.getResourceCount(typeId) + amount);
      return true;
    }

    const matchingSlotIndex = this.findMatchingBuildableSlotIndex(typeId);
    if (matchingSlotIndex !== null) {
      const slot = this.hotbarSlots[matchingSlotIndex];
      if (slot?.kind === "buildable") {
        slot.count += amount;
        return true;
      }
    }

    const emptySlotIndex = this.findFirstEmptyHotbarSlotIndex();
    if (emptySlotIndex === null) {
      return false;
    }

    this.hotbarSlots[emptySlotIndex] = {
      kind: "buildable",
      typeId,
      count: amount,
    };
    return true;
  }

  public addWeapon(weapon: Weapon): boolean {
    const emptySlotIndex = this.findFirstEmptyHotbarSlotIndex();
    if (emptySlotIndex === null) {
      return false;
    }

    this.hotbarSlots[emptySlotIndex] = {
      kind: "weapon",
      weapon,
    };
    return true;
  }

  public canAddWeaponCount(count: number): boolean {
    if (count <= 0) {
      return true;
    }

    return this.countEmptyHotbarSlots() >= count;
  }

  public canAddStackable(typeId: ResourceId, amount: number): boolean {
    if (amount <= 0) {
      return true;
    }

    if (!this.isBuildableType(typeId)) {
      return true;
    }

    return (
      this.findMatchingBuildableSlotIndex(typeId) !== null ||
      this.findFirstEmptyHotbarSlotIndex() !== null
    );
  }

  public canAbsorbInventory(other: Inventory): boolean {
    const simulatedSlots = this.hotbarSlots.map((slot) => {
      if (!slot) {
        return null;
      }
      if (slot.kind === "weapon") {
        return { kind: "weapon" as const };
      }
      return {
        kind: "buildable" as const,
        typeId: slot.typeId,
        count: slot.count,
      };
    });

    for (const slot of other.hotbarSlots) {
      if (!slot) {
        continue;
      }
      if (slot.kind === "weapon") {
        const emptySlotIndex = simulatedSlots.findIndex(
          (simulatedSlot) => simulatedSlot === null,
        );
        if (emptySlotIndex < 0) {
          return false;
        }
        simulatedSlots[emptySlotIndex] = { kind: "weapon" };
        continue;
      }

      const matchingSlotIndex = simulatedSlots.findIndex(
        (simulatedSlot) =>
          simulatedSlot?.kind === "buildable" &&
          simulatedSlot.typeId === slot.typeId,
      );
      if (matchingSlotIndex >= 0) {
        continue;
      }

      const emptySlotIndex = simulatedSlots.findIndex(
        (simulatedSlot) => simulatedSlot === null,
      );
      if (emptySlotIndex < 0) {
        return false;
      }
      simulatedSlots[emptySlotIndex] = {
        kind: "buildable",
        typeId: slot.typeId,
        count: slot.count,
      };
    }

    return true;
  }

  public absorbInventory(other: Inventory): boolean {
    if (!this.canAbsorbInventory(other)) {
      return false;
    }

    for (const [typeId, amount] of other.resources.entries()) {
      this.addStackable(typeId, amount);
    }

    for (const slot of other.hotbarSlots) {
      if (!slot) {
        continue;
      }
      if (slot.kind === "weapon") {
        this.addWeapon(slot.weapon);
      } else {
        this.addStackable(slot.typeId, slot.count);
      }
    }

    for (const unlockedRecipeTypeId of other.unlockedRecipeTypeIds) {
      this.unlockRecipe(unlockedRecipeTypeId);
    }

    return true;
  }

  public absorbInventoryByAcquisitionRules(source: Inventory): boolean {
    const transferable = this.createInventoryTransferableOnAcquisition(source);
    if (!this.canAbsorbInventory(transferable)) {
      return false;
    }
    if (!this.absorbInventory(transferable)) {
      return false;
    }
    this.grantAcquisitionOnlyItems(source);
    return true;
  }

  public grantItem(item: Item, amount: number): boolean {
    return item.grantToInventory(this, amount);
  }

  public grantItemCtor(ctor: RegistrableItemCtor, amount: number): boolean {
    return this.grantItem(new ctor(), amount);
  }

  public unlockRecipe(typeId: ResourceId): boolean {
    if (this.unlockedRecipeTypeIds.has(typeId)) {
      return false;
    }
    this.unlockedRecipeTypeIds.add(typeId);
    this.unlockedRecipesDirty = true;
    return true;
  }

  public isRecipeUnlocked(typeId: ResourceId): boolean {
    return this.unlockedRecipeTypeIds.has(typeId);
  }

  public getUnlockedRecipeTypeIds(): readonly ResourceId[] {
    return this.getUnlockedRecipeSnapshot();
  }

  public getActiveWeapon(): Weapon | undefined {
    const selectedSlot = this.hotbarSlots[this.selectedHotbarIndex];
    return selectedSlot?.kind === "weapon" ? selectedSlot.weapon : undefined;
  }

  private createInventoryTransferableOnAcquisition(
    source: Inventory,
  ): Inventory {
    const transferable = new Inventory();

    for (const [typeId, amount] of source.resources.entries()) {
      const item = this.createItem(typeId);
      if (item.isStoredOnInventoryAcquisition()) {
        transferable.addStackable(typeId, amount);
      }
    }

    for (const slot of source.hotbarSlots) {
      if (!slot) {
        continue;
      }
      if (slot.kind === "weapon") {
        if (slot.weapon.isStoredOnInventoryAcquisition()) {
          transferable.addWeapon(slot.weapon);
        }
        continue;
      }

      const item = this.createItem(slot.typeId);
      if (item.isStoredOnInventoryAcquisition()) {
        transferable.addStackable(slot.typeId, slot.count);
      }
    }

    for (const unlockedRecipeTypeId of source.getUnlockedRecipeTypeIds()) {
      transferable.unlockRecipe(unlockedRecipeTypeId);
    }

    return transferable;
  }

  private grantAcquisitionOnlyItems(source: Inventory): void {
    for (const [typeId, amount] of source.resources.entries()) {
      const item = this.createItem(typeId);
      if (!item.isStoredOnInventoryAcquisition()) {
        item.grantToInventory(this, amount);
      }
    }

    for (const slot of source.hotbarSlots) {
      if (!slot) {
        continue;
      }

      const item =
        slot.kind === "weapon" ? slot.weapon : this.createItem(slot.typeId);
      if (item.isStoredOnInventoryAcquisition()) {
        continue;
      }
      item.grantToInventory(this, slot.kind === "weapon" ? 1 : slot.count);
    }
  }

  private createItem(typeId: ResourceId): Item {
    return new (itemTypeRegistry.require(typeId).ctor)();
  }

  public getSelectedBuildable(): BuildableSlot | undefined {
    const selectedSlot = this.hotbarSlots[this.selectedHotbarIndex];
    return selectedSlot?.kind === "buildable" ? selectedSlot : undefined;
  }

  public setSelectedHotbarIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SLOT_COUNT) {
      return;
    }

    this.selectedHotbarIndex = index;
  }

  public getResourceCount(typeId: ResourceId): number {
    return this.resources.get(typeId) ?? 0;
  }

  public getStackableCount(typeId: ResourceId): number {
    return this.countType(typeId);
  }

  public countType(typeId: ResourceId): number {
    let total = this.getResourceCount(typeId);
    for (const slot of this.hotbarSlots) {
      if (!slot) {
        continue;
      }
      if (slot.kind === "weapon") {
        total += Number(slot.weapon.typeId === typeId);
      } else if (slot.typeId === typeId) {
        total += slot.count;
      }
    }
    return total;
  }

  public hasTypes(requirements: ItemRequirement[]): boolean {
    return requirements.every(
      (requirement) => this.countType(requirement.typeId) >= requirement.amount,
    );
  }

  public consumeTypes(requirements: ItemRequirement[]): boolean {
    if (!this.hasTypes(requirements)) {
      return false;
    }

    for (const requirement of requirements) {
      let remaining = requirement.amount;
      const resourceCount = this.getResourceCount(requirement.typeId);
      if (resourceCount > 0) {
        const consumedAmount = Math.min(resourceCount, remaining);
        this.setResourceCount(
          requirement.typeId,
          resourceCount - consumedAmount,
        );
        remaining -= consumedAmount;
      }

      for (
        let slotIndex = this.hotbarSlots.length - 1;
        slotIndex >= 0 && remaining > 0;
        slotIndex -= 1
      ) {
        const slot = this.hotbarSlots[slotIndex];
        if (!slot) {
          continue;
        }

        if (slot.kind === "buildable" && slot.typeId === requirement.typeId) {
          const consumedAmount = Math.min(slot.count, remaining);
          slot.count -= consumedAmount;
          remaining -= consumedAmount;
          if (slot.count <= 0) {
            this.hotbarSlots[slotIndex] = null;
          }
          continue;
        }

        if (
          slot.kind === "weapon" &&
          slot.weapon.typeId === requirement.typeId
        ) {
          this.hotbarSlots[slotIndex] = null;
          remaining -= 1;
        }
      }
    }

    return true;
  }

  public consumeSelectedBuildable(amount: number): boolean {
    if (amount <= 0) {
      return true;
    }

    const selectedSlot = this.hotbarSlots[this.selectedHotbarIndex];
    if (!selectedSlot || selectedSlot.kind !== "buildable") {
      return false;
    }
    if (selectedSlot.count < amount) {
      return false;
    }

    selectedSlot.count -= amount;
    if (selectedSlot.count <= 0) {
      this.hotbarSlots[this.selectedHotbarIndex] = null;
    }
    return true;
  }

  public moveHotbarSlot(fromSlotIndex: number, toSlotIndex: number): boolean {
    if (
      fromSlotIndex < 0 ||
      fromSlotIndex >= HOTBAR_SLOT_COUNT ||
      toSlotIndex < 0 ||
      toSlotIndex >= HOTBAR_SLOT_COUNT ||
      fromSlotIndex === toSlotIndex
    ) {
      return false;
    }

    const fromSlot = this.hotbarSlots[fromSlotIndex];
    const toSlot = this.hotbarSlots[toSlotIndex];
    if (!fromSlot) {
      return false;
    }

    if (
      fromSlot.kind === "buildable" &&
      toSlot?.kind === "buildable" &&
      fromSlot.typeId === toSlot.typeId
    ) {
      toSlot.count += fromSlot.count;
      this.hotbarSlots[fromSlotIndex] = null;
      return true;
    }

    this.hotbarSlots[fromSlotIndex] = toSlot ?? null;
    this.hotbarSlots[toSlotIndex] = fromSlot;
    return true;
  }

  public clearHotbar(): void {
    for (
      let slotIndex = 0;
      slotIndex < this.hotbarSlots.length;
      slotIndex += 1
    ) {
      this.hotbarSlots[slotIndex] = null;
    }
    this.selectedHotbarIndex = 0;
  }

  public iterateWeaponSlots(): Weapon[] {
    const weapons: Weapon[] = [];
    for (const slot of this.hotbarSlots) {
      if (slot?.kind === "weapon") {
        weapons.push(slot.weapon);
      }
    }
    return weapons;
  }

  public toSnapshot(owner?: Entity): InventorySnapshot {
    return {
      resources: this.getResourceSnapshot(),
      hotbarSlots: this.hotbarSlots.map((slot) =>
        this.toSlotSnapshot(slot, owner),
      ),
      selectedHotbarIndex: this.selectedHotbarIndex,
      unlockedRecipeTypeIds: this.getUnlockedRecipeSnapshot(),
    };
  }

  private getResourceSnapshot(): InventorySnapshot["resources"] {
    if (!this.cachedResourceSnapshot || this.resourcesDirty) {
      this.cachedResourceSnapshot = [...this.resources.entries()]
        .filter(([, amount]) => amount > 0)
        .sort(([leftTypeId], [rightTypeId]) =>
          leftTypeId.localeCompare(rightTypeId),
        )
        .map(([typeId, amount]) => ({ typeId, amount }));
      this.resourcesDirty = false;
    }

    return this.cachedResourceSnapshot;
  }

  private getUnlockedRecipeSnapshot(): InventorySnapshot["unlockedRecipeTypeIds"] {
    if (!this.cachedUnlockedRecipeSnapshot || this.unlockedRecipesDirty) {
      this.cachedUnlockedRecipeSnapshot = [...this.unlockedRecipeTypeIds].sort(
        (leftTypeId, rightTypeId) => leftTypeId.localeCompare(rightTypeId),
      );
      this.unlockedRecipesDirty = false;
    }
    return this.cachedUnlockedRecipeSnapshot;
  }

  private findMatchingBuildableSlotIndex(typeId: ResourceId): number | null {
    const slotIndex = this.hotbarSlots.findIndex(
      (slot) => slot?.kind === "buildable" && slot.typeId === typeId,
    );
    return slotIndex >= 0 ? slotIndex : null;
  }

  private findFirstEmptyHotbarSlotIndex(): number | null {
    const slotIndex = this.hotbarSlots.findIndex((slot) => slot === null);
    return slotIndex >= 0 ? slotIndex : null;
  }

  private countEmptyHotbarSlots(): number {
    return this.hotbarSlots.reduce(
      (total, slot) => total + Number(slot === null),
      0,
    );
  }

  private setResourceCount(typeId: ResourceId, amount: number): void {
    if (amount > 0) {
      this.resources.set(typeId, amount);
    } else {
      this.resources.delete(typeId);
    }
    this.resourcesDirty = true;
  }

  private toSlotSnapshot(
    slot: InventorySlot,
    owner?: Entity,
  ): InventorySlotSnapshot {
    if (!slot) {
      return { kind: "empty" };
    }

    if (slot.kind === "weapon") {
      return {
        kind: "weapon",
        ...slot.weapon.toSnapshot(),
        reserveMagCount: slot.weapon.getReserveMagCount(owner),
      };
    }

    return {
      kind: "buildable",
      typeId: slot.typeId,
      count: slot.count,
    };
  }

  private isBuildableType(typeId: ResourceId): boolean {
    const content = getItemContent(typeId);
    return Boolean(content?.buildsEntityTypeId || content?.consumable);
  }
}
