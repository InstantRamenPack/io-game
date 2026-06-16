import { Item } from "@server/items/Item.ts";
import type { Inventory } from "@server/items/Inventory.ts";
import type { ItemRequirement } from "@shared/content/schema.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { getItemLikeTypeEntry } from "@server/registry/itemLikeRegistry.ts";
import { requireWeaponContent } from "@shared/content/catalog.ts";
import type { EnemyTuningConfig } from "@shared/config/gameplayConfig.ts";
import type {
  EquippedItemSnapshot,
  WeaponSnapshot,
} from "@shared/net/snapshots.ts";

export type EnemyWeaponTuningMode = "day" | "night" | "baseline";

/**
 * Abstract weapon item that can perform attacks.
 * Subclasses implement specific attack behavior (ranged vs melee).
 */
export abstract class Weapon extends Item {
  /** Fixed-tick cooldown until next fire. */
  protected cooldownTicks = 0;
  private cooldownTicksPerUse: number;
  private baselineCooldownTicksPerUse: number;
  private enemyTuningMode: EnemyWeaponTuningMode = "baseline";

  protected constructor(cooldownTicksPerUse: number) {
    super();
    this.cooldownTicksPerUse = Math.max(1, Math.floor(cooldownTicksPerUse));
    this.baselineCooldownTicksPerUse = this.cooldownTicksPerUse;
  }

  /** Advances cooldown state by one fixed tick. */
  public override tick(world: World): void {
    if (this.cooldownTicks > 0) {
      this.cooldownTicks = Math.max(
        0,
        this.cooldownTicks - world.gameConfig.simulationSpeedMultiplier,
      );
    }
  }

  /** @returns True if weapon can hit now. */
  public canHit(): boolean {
    return this.cooldownTicks <= 0;
  }

  /**
   * Returns whether this weapon can currently hit the provided target.
   */
  public abstract canHitTarget(
    world: World,
    owner: Entity,
    target: Entity,
  ): boolean;

  /** Attempts an attack toward the given aim point. */
  public abstract hit(world: World, owner: Entity, theta: number): boolean;

  /** Resets cooldown after a successful hit attempt. */
  protected resetCooldown(): void {
    this.cooldownTicks = this.cooldownTicksPerUse;
  }

  public scaleCooldownTicksPerUse(multiplier: number): void {
    this.cooldownTicksPerUse = Math.max(
      1,
      Math.floor(this.cooldownTicksPerUse * multiplier),
    );
  }

  public scaleAttackRange(_multiplier: number): void {
    // Weapons without explicit range ignore enemy range tuning.
  }

  public captureEnemyTuningBaseline(): void {
    this.baselineCooldownTicksPerUse = this.cooldownTicksPerUse;
  }

  public syncEnemyTuning(
    mode: EnemyWeaponTuningMode,
    tuning: EnemyTuningConfig,
  ): void {
    if (mode === this.enemyTuningMode) {
      return;
    }
    this.enemyTuningMode = mode;

    this.cooldownTicksPerUse = this.baselineCooldownTicksPerUse;
    this.resetEnemyAttackRangeToBaseline();
    if (mode === "baseline") {
      return;
    }

    const weaponContent = requireWeaponContent(this.typeId);
    const cooldownMultiplier =
      mode === "day"
        ? weaponContent.attackStyle === "shoot"
          ? tuning.rangedWeaponCooldownMultiplier
          : tuning.meleeWeaponCooldownMultiplier
        : weaponContent.attackStyle === "shoot"
          ? tuning.nightRangedWeaponCooldownMultiplier
          : 1;
    this.cooldownTicksPerUse = Math.max(
      1,
      Math.floor(this.baselineCooldownTicksPerUse * cooldownMultiplier),
    );
    if (mode === "day") {
      this.scaleAttackRange(tuning.weaponAttackRangeMultiplier);
      return;
    }
    if (weaponContent.attackStyle === "shoot") {
      this.scaleAttackRange(tuning.nightWeaponAttackRangeMultiplier);
    }
  }

  protected resetEnemyAttackRangeToBaseline(): void {
    // Ranged weapons override this to restore projectile range.
  }

  public toSnapshot(): WeaponSnapshot {
    return {
      typeId: this.typeId,
      ownerId: this.ownerId,
      cooldownTicksRemaining: this.cooldownTicks,
    };
  }

  public toEquippedItemSnapshot(
    _owner: Entity | undefined,
  ): EquippedItemSnapshot {
    const weaponContent = requireWeaponContent(this.typeId);
    return {
      typeId: this.typeId,
      attackStyle: weaponContent.attackStyle,
      cooldownTicksRemaining: this.cooldownTicks,
    };
  }

  public getReserveMagCount(_owner: Entity | undefined): number | undefined {
    return undefined;
  }

  /**
   * Optional override for weapons whose recycle value depends on instance state
   * (e.g. remaining charge). Returns undefined to fall back to the content-based lookup.
   */
  public getRecycleHunkValue(): number | undefined {
    return undefined;
  }

  public override isWeaponItem(): boolean {
    return true;
  }

  public override requiresManualPickup(): boolean {
    return true;
  }

  public override canGrantToInventory(
    targetInventory: Inventory,
    amount: number,
  ): boolean {
    return targetInventory.canAddWeaponCount(amount);
  }

  public override canGrantToInventoryAfterConsuming(
    targetInventory: Inventory,
    amount: number,
    costs: readonly ItemRequirement[],
  ): boolean {
    const slotsFreedByCosts = costs.reduce((total, cost) => {
      const costEntry = getItemLikeTypeEntry(cost.typeId);
      return (
        total +
        (costEntry
          ? new costEntry.ctor().getHotbarSlotsFreedWhenConsumed(cost.amount)
          : 0)
      );
    }, 0);
    const netSlotsNeeded = amount - slotsFreedByCosts;
    return (
      netSlotsNeeded <= 0 || targetInventory.canAddWeaponCount(netSlotsNeeded)
    );
  }

  public override grantToInventory(
    targetInventory: Inventory,
    amount: number,
  ): boolean {
    if (amount <= 0) {
      return true;
    }
    if (!this.canGrantToInventory(targetInventory, amount)) {
      return false;
    }

    const WeaponCtor = this.constructor as new () => Weapon;
    for (let index = 0; index < amount; index += 1) {
      targetInventory.addWeapon(new WeaponCtor());
    }
    return true;
  }

  public override getHotbarSlotsFreedWhenConsumed(amount: number): number {
    return amount;
  }

  public override getCraftTraceResult(): "crafted_weapon" {
    return "crafted_weapon";
  }
}
