import type { ItemRequirement } from "@shared/content/schema.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { InventorySnapshot } from "@shared/net/snapshots.ts";
import type { Weapon } from "@server/items/Weapon.ts";

export class Inventory {
  public stackables = new Map<ResourceId, number>();
  public weapons: Weapon[] = [];
  public activeWeaponIndex: number | null = null;

  public addStackable(typeId: ResourceId, amount: number): void {
    if (amount <= 0) {
      return;
    }

    this.stackables.set(typeId, this.getStackableCount(typeId) + amount);
  }

  public getStackableCount(typeId: ResourceId): number {
    return this.stackables.get(typeId) ?? 0;
  }

  public addWeapon(weapon: Weapon): void {
    this.weapons.push(weapon);
    if (this.activeWeaponIndex === null) {
      this.activeWeaponIndex = 0;
    }
  }

  public getActiveWeapon(): Weapon | undefined {
    if (this.activeWeaponIndex === null) {
      return undefined;
    }

    return this.weapons[this.activeWeaponIndex];
  }

  public setActiveWeaponIndex(index: number | null): void {
    if (index === null || this.weapons.length === 0) {
      this.activeWeaponIndex = null;
      return;
    }
    if (index < 0 || index >= this.weapons.length) {
      return;
    }
    this.activeWeaponIndex = index;
  }

  public countType(typeId: ResourceId): number {
    const stackableCount = this.getStackableCount(typeId);
    const weaponCount = this.weapons.reduce(
      (total, weapon) => total + Number(weapon.typeId === typeId),
      0,
    );
    return stackableCount + weaponCount;
  }

  public hasTypes(requirements: ItemRequirement[]): boolean {
    for (const requirement of requirements) {
      if (this.countType(requirement.typeId) < requirement.amount) {
        return false;
      }
    }
    return true;
  }

  public consumeTypes(requirements: ItemRequirement[]): boolean {
    if (!this.hasTypes(requirements)) {
      return false;
    }

    for (const requirement of requirements) {
      let remaining = requirement.amount;

      const stackableCount = this.getStackableCount(requirement.typeId);
      if (stackableCount > 0) {
        const consumedStackableCount = Math.min(stackableCount, remaining);
        const nextStackableCount = stackableCount - consumedStackableCount;
        if (nextStackableCount > 0) {
          this.stackables.set(requirement.typeId, nextStackableCount);
        } else {
          this.stackables.delete(requirement.typeId);
        }
        remaining -= consumedStackableCount;
      }

      for (let index = this.weapons.length - 1; index >= 0 && remaining > 0; index -= 1) {
        const weapon = this.weapons[index];
        if (!weapon || weapon.typeId !== requirement.typeId) {
          continue;
        }

        this.removeWeaponAt(index);
        remaining -= 1;
      }
    }

    return true;
  }

  public toSnapshot(): InventorySnapshot {
    return {
      stackables: [...this.stackables.entries()]
        .sort(([leftTypeId], [rightTypeId]) =>
          leftTypeId.localeCompare(rightTypeId),
        )
        .map(([typeId, amount]) => ({ typeId, amount })),
      weapons: this.weapons.map((weapon) => weapon.toSnapshot()),
      activeWeaponIndex: this.activeWeaponIndex,
    };
  }

  private removeWeaponAt(index: number): void {
    if (index < 0 || index >= this.weapons.length) {
      return;
    }

    this.weapons.splice(index, 1);
    if (this.weapons.length === 0) {
      this.activeWeaponIndex = null;
      return;
    }

    if (this.activeWeaponIndex === null) {
      return;
    }

    if (index < this.activeWeaponIndex) {
      this.activeWeaponIndex -= 1;
      return;
    }

    if (index === this.activeWeaponIndex) {
      this.activeWeaponIndex = Math.min(
        this.activeWeaponIndex,
        this.weapons.length - 1,
      );
    }
  }
}
