import { Item } from "@server/items/Item.ts";
import type { World } from "@server/world/World.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { requireWeaponContent } from "@shared/content/catalog.ts";
import type {
  EquippedItemSnapshot,
  WeaponSnapshot,
} from "@shared/net/snapshots.ts";

/**
 * Abstract weapon item that can perform attacks.
 * Subclasses implement specific attack behavior (ranged vs melee).
 */
export abstract class Weapon extends Item {
  /** Fixed-tick cooldown until next fire. */
  protected cooldownTicks = 0;
  private readonly cooldownTicksPerUse: number;

  protected constructor(cooldownTicksPerUse: number) {
    super();
    this.cooldownTicksPerUse = Math.max(1, Math.floor(cooldownTicksPerUse));
  }

  /** Advances cooldown state by one fixed tick. */
  public override tick(_world: World): void {
    if (this.cooldownTicks > 0) {
      this.cooldownTicks -= 1;
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
}
